import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { StageState, StageStatus, User, RealtimeMessage, BellEvent } from '../types';
import { playCompetitionBell } from '../utils/audioBell';

// Enforced Server-Side Stage State Machine Sequence:
// HOLDING -> CALLED -> QUESTION_SELECTION_ALLOWED -> QUESTION_SELECTED -> READY -> PERFORMING -> PERFORMANCE_FINISHED -> HOLDING
export const STAGE_TRANSITION_SEQUENCE: readonly StageStatus[] = [
  'HOLDING',
  'CALLED',
  'QUESTION_SELECTION_ALLOWED',
  'QUESTION_SELECTED',
  'READY',
  'PERFORMING',
  'PERFORMANCE_FINISHED',
  'HOLDING'
] as const;

export const VALID_STAGE_TRANSITIONS: Record<string, StageStatus[]> = {
  HOLDING: ['CALLED', 'RESET'],
  CALLED: ['QUESTION_SELECTION_ALLOWED', 'QUESTION_SELECTED', 'HOLDING', 'RESET'],
  QUESTION_SELECTION_ALLOWED: ['QUESTION_SELECTED', 'READY', 'CALLED', 'HOLDING', 'RESET'],
  QUESTION_SELECTED: ['READY', 'PERFORMING', 'QUESTION_SELECTION_ALLOWED', 'HOLDING', 'RESET'],
  READY: ['PERFORMING', 'QUESTION_SELECTED', 'HOLDING', 'RESET'],
  PERFORMING: ['PERFORMANCE_FINISHED', 'HOLDING', 'RESET'],
  PERFORMANCE_FINISHED: ['HOLDING', 'CALLED', 'RESET'],
  RECALLED: ['CALLED', 'QUESTION_SELECTION_ALLOWED', 'HOLDING', 'RESET'],
  RESET: ['HOLDING', 'CALLED']
};

interface CompetitionContextType {
  user: User | null;
  stageState: StageState | null;
  connected: boolean;
  activeBell: BellEvent | null;
  lastError: string | null;
  clearError: () => void;
  refreshStage: () => Promise<void>;
  
  // Transition actions in state machine
  callParticipant: (participantId: string) => Promise<boolean>;
  allowQuestionSelection: () => Promise<boolean>;
  selectQuestion: (questionNumber: string, method?: 'PODIUM' | 'OPERATOR_OVERRIDE') => Promise<{ success: boolean; error?: string }>;
  resetQuestion: (questionNumber?: string, questionId?: string, resetAll?: boolean) => Promise<{ success: boolean; error?: string }>;
  setReady: () => Promise<boolean>;
  startPerformance: () => Promise<boolean>;
  pauseResumeTimer: (action: 'pause' | 'resume' | 'reset', offset?: number) => Promise<boolean>;
  finishPerformance: () => Promise<boolean>;
  returnToHolding: () => Promise<boolean>;
  recallParticipant: (participantId: string, reason?: string) => Promise<boolean>;
  resetStage: () => Promise<boolean>;
  
  // State machine helper utilities
  transitionStage: (targetStatus: StageStatus, payload?: Record<string, any>) => Promise<{ success: boolean; error?: string; state?: StageState }>;
  canTransitionTo: (targetStatus: StageStatus) => boolean;
  getNextStageStatus: () => StageStatus | null;
  stageTransitionSequence: readonly StageStatus[];
  
  triggerBell: (bellType: 'FIRST_WARNING' | 'FINAL_WARNING' | 'STOP') => Promise<boolean>;
  login: (u: User) => void;
  logout: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

const CompetitionContext = createContext<CompetitionContextType | null>(null);

export const CompetitionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Check stored user session
  const [user, setUser] = useState<User | null>(() => {
    // 1. Check sessionStorage (mandatory for PODIUM role which resets on window close)
    const sessionSaved = sessionStorage.getItem('ababeel_user');
    if (sessionSaved) {
      try {
        const parsed = JSON.parse(sessionSaved);
        if (parsed && parsed.id) return parsed;
      } catch (e) {
        // ignore
      }
    }

    // 2. Check localStorage for persistent roles (ADMIN, OPERATOR, JUDGE, AUDIENCE)
    const saved = localStorage.getItem('ababeel_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // PODIUM role is never restored from localStorage
        if (parsed && parsed.id && parsed.role !== 'PODIUM') {
          return parsed;
        }
      } catch (e) {
        return null;
      }
    }
    // Starts with null so the login page is presented initially
    return null;
  });

  const [stageState, setStageState] = useState<StageState | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [activeBell, setActiveBell] = useState<BellEvent | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const clearError = useCallback(() => setLastError(null), []);

  const fetchStage = useCallback(async () => {
    try {
      const res = await fetch('/api/stage/state');
      if (res.ok) {
        const data = await res.json();
        setStageState(data);
      }
    } catch (err) {
      console.error('Failed to load stage state:', err);
    }
  }, []);

  // WebSocket / SSE Realtime setup
  useEffect(() => {
    fetchStage();

    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (evt) => {
          try {
            const data: RealtimeMessage = JSON.parse(evt.data);
            handleRealtimeEvent(data);
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          // Try reconnect or fallback to SSE
          reconnectTimeout = setTimeout(connectWS, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        console.warn('WS not supported or failed, falling back to SSE:', err);
        connectSSE();
      }
    };

    const connectSSE = () => {
      sse = new EventSource('/api/stage/stream');
      sse.onopen = () => setConnected(true);
      sse.onmessage = (e) => {
        try {
          const data: RealtimeMessage = JSON.parse(e.data);
          handleRealtimeEvent(data);
        } catch (err) {
          // ignore heartbeat
        }
      };
      sse.onerror = () => setConnected(false);
    };

    const handleRealtimeEvent = (msg: RealtimeMessage) => {
      switch (msg.type) {
        case 'INIT_STATE':
        case 'STAGE_STATE_UPDATED':
        case 'PARTICIPANT_CALLED':
        case 'QUESTION_SELECTION_ENABLED':
        case 'QUESTION_SELECTED':
        case 'STAGE_READY':
        case 'PERFORMANCE_STARTED':
        case 'PERFORMANCE_FINISHED':
        case 'HOLDING_SCREEN_STARTED':
        case 'TIMER_UPDATED':
          setStageState(msg.payload);
          break;

        case 'BELL_TRIGGERED':
          setActiveBell(msg.payload);
          if (soundEnabled) {
            playCompetitionBell(msg.payload.bell_type);
          }
          setTimeout(() => {
            setActiveBell((prev) => (prev?.id === msg.payload.id ? null : prev));
          }, 3500);
          break;

        default:
          break;
      }
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (sse) sse.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchStage, soundEnabled]);

  // Window close handler for podium: clears session immediately
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user?.role === 'PODIUM') {
        sessionStorage.removeItem('ababeel_user');
        localStorage.removeItem('ababeel_user');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleBeforeUnload);
    };
  }, [user]);

  const login = (u: User) => {
    setUser(u);
    if (u.role === 'PODIUM') {
      // Podium role is strictly stored in sessionStorage only
      // It does not persist across browser/window closure
      sessionStorage.setItem('ababeel_user', JSON.stringify(u));
      localStorage.removeItem('ababeel_user');
    } else {
      localStorage.setItem('ababeel_user', JSON.stringify(u));
      sessionStorage.setItem('ababeel_user', JSON.stringify(u));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ababeel_user');
    sessionStorage.removeItem('ababeel_user');
  };

  // State machine transition helper
  const canTransitionTo = useCallback((targetStatus: StageStatus): boolean => {
    const current = stageState?.stage_status || 'HOLDING';
    if (current === targetStatus) return true;
    const allowed = VALID_STAGE_TRANSITIONS[current];
    return allowed ? allowed.includes(targetStatus) : false;
  }, [stageState?.stage_status]);

  // Compute the expected next stage status in the standard sequence:
  // HOLDING -> CALLED -> QUESTION_SELECTION_ALLOWED -> QUESTION_SELECTED -> READY -> PERFORMING -> PERFORMANCE_FINISHED -> HOLDING
  const getNextStageStatus = useCallback((): StageStatus | null => {
    const current = stageState?.stage_status || 'HOLDING';
    switch (current) {
      case 'HOLDING':
        return 'CALLED';
      case 'CALLED':
        return 'QUESTION_SELECTION_ALLOWED';
      case 'QUESTION_SELECTION_ALLOWED':
        return 'QUESTION_SELECTED';
      case 'QUESTION_SELECTED':
        return 'READY';
      case 'READY':
        return 'PERFORMING';
      case 'PERFORMING':
        return 'PERFORMANCE_FINISHED';
      case 'PERFORMANCE_FINISHED':
        return 'HOLDING';
      default:
        return 'HOLDING';
    }
  }, [stageState?.stage_status]);

  // 1. HOLDING -> CALLED
  const callParticipant = async (participantId: string): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId, operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to call participant onto stage.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error while calling participant.');
    }
    return false;
  };

  // 2. CALLED -> QUESTION_SELECTION_ALLOWED
  const allowQuestionSelection = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/allow-question-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to allow question selection.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error enabling question selection.');
    }
    return false;
  };

  // 3. QUESTION_SELECTION_ALLOWED -> QUESTION_SELECTED
  const selectQuestion = async (
    questionNumber: string,
    method: 'PODIUM' | 'OPERATOR_OVERRIDE' = 'PODIUM'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/question-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_number: questionNumber, selection_method: method, operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return { success: true };
      }
      const err = data.error || 'Failed to select question.';
      setLastError(err);
      return { success: false, error: err };
    } catch (e: any) {
      const err = e.message || 'Network error selecting question.';
      setLastError(err);
      return { success: false, error: err };
    }
  };

  // Reset previously picked or current question
  const resetQuestion = async (
    questionNumber?: string,
    questionId?: string,
    resetAll?: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/question-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_number: questionNumber,
          question_id: questionId,
          reset_all: resetAll,
          operator_id: user?.id
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return { success: true };
      }
      const err = data.error || 'Failed to reset question.';
      setLastError(err);
      return { success: false, error: err };
    } catch (e: any) {
      const err = e.message || 'Network error resetting question.';
      setLastError(err);
      return { success: false, error: err };
    }
  };

  // 4. QUESTION_SELECTED -> READY
  const setReady = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to mark stage ready.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error marking stage ready.');
    }
    return false;
  };

  // 5. READY | QUESTION_SELECTED -> PERFORMING
  const startPerformance = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to start performance.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error starting performance.');
    }
    return false;
  };

  const pauseResumeTimer = async (action: 'pause' | 'resume' | 'reset', offset?: number): Promise<boolean> => {
    try {
      const res = await fetch('/api/stage/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, offset })
      });
      if (res.ok) {
        await fetchStage();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  // 6. PERFORMING -> PERFORMANCE_FINISHED
  const finishPerformance = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to finish performance.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error finishing performance.');
    }
    return false;
  };

  // 7. PERFORMANCE_FINISHED -> HOLDING (Manual or post-timer)
  const returnToHolding = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/holding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to return to holding.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error returning to holding.');
    }
    return false;
  };

  const recallParticipant = async (participantId: string, reason?: string): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId, operator_id: user?.id, reason })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to recall participant.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error recalling participant.');
    }
    return false;
  };

  const resetStage = async (): Promise<boolean> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return true;
      }
      setLastError(data.error || 'Failed to reset stage.');
    } catch (e: any) {
      console.error(e);
      setLastError(e.message || 'Network error resetting stage.');
    }
    return false;
  };

  // General server-side stage transition dispatcher
  const transitionStage = async (
    targetStatus: StageStatus,
    payload: Record<string, any> = {}
  ): Promise<{ success: boolean; error?: string; state?: StageState }> => {
    try {
      setLastError(null);
      const res = await fetch('/api/stage/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_status: targetStatus,
          operator_id: user?.id,
          ...payload
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setStageState(data.state);
        else await fetchStage();
        return { success: true, state: data.state };
      }
      const err = data.error || `Failed transition to ${targetStatus}`;
      setLastError(err);
      return { success: false, error: err };
    } catch (e: any) {
      const err = e.message || `Network error during transition to ${targetStatus}`;
      setLastError(err);
      return { success: false, error: err };
    }
  };

  const triggerBell = async (bellType: 'FIRST_WARNING' | 'FINAL_WARNING' | 'STOP'): Promise<boolean> => {
    try {
      const res = await fetch('/api/bells/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bell_type: bellType,
          judge_id: user?.judge_id,
          user_role: user?.role
        })
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return (
    <CompetitionContext.Provider
      value={{
        user,
        stageState,
        connected,
        activeBell,
        lastError,
        clearError,
        refreshStage: fetchStage,
        callParticipant,
        allowQuestionSelection,
        selectQuestion,
        resetQuestion,
        setReady,
        startPerformance,
        pauseResumeTimer,
        finishPerformance,
        returnToHolding,
        recallParticipant,
        resetStage,
        transitionStage,
        canTransitionTo,
        getNextStageStatus,
        stageTransitionSequence: STAGE_TRANSITION_SEQUENCE,
        triggerBell,
        login,
        logout,
        soundEnabled,
        setSoundEnabled
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
};

export const useCompetition = () => {
  const context = useContext(CompetitionContext);
  if (!context) {
    throw new Error('useCompetition must be used within CompetitionProvider');
  }
  return context;
};
