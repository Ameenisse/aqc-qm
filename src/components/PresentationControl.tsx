import React, { useState, useEffect, useMemo } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { Participant, Question } from '../types';
import { renderQuranPassage, formatQuestionRange } from '../utils/quran';

export const PresentationControl: React.FC = () => {
  const {
    stageState,
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
    canTransitionTo,
    lastError,
    clearError
  } = useCompetition();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAttendance, setFilterAttendance] = useState('');

  // Confirmation Modals state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    body: React.ReactNode;
    okText: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [actionProcessing, setActionProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Timer local state
  const [elapsedSec, setElapsedSec] = useState(0);

  const loadParticipants = async () => {
    setLoadingParticipants(true);
    try {
      const res = await fetch('/api/participants');
      if (res.ok) {
        const list = await res.json();
        setParticipants(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingParticipants(false);
    }
  };

  useEffect(() => {
    loadParticipants();
    const interval = setInterval(loadParticipants, 4000);
    return () => clearInterval(interval);
  }, []);

  // Timer calculation
  useEffect(() => {
    if (!stageState?.timer_started_at) {
      setElapsedSec(stageState?.timer_offset || 0);
      return;
    }
    const interval = setInterval(() => {
      if (stageState.timer_paused_at) return;
      const started = new Date(stageState.timer_started_at!).getTime();
      const now = Date.now();
      const diffSec = Math.floor((now - started) / 1000) + (stageState.timer_offset || 0);
      setElapsedSec(Math.max(0, diffSec));
    }, 500);
    return () => clearInterval(interval);
  }, [stageState?.timer_started_at, stageState?.timer_paused_at, stageState?.timer_offset]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timerEnabled =
    (stageState?.timer_mode || 'stopwatch').toUpperCase() !== 'DISABLED' &&
    (stageState?.competition?.performance_timer_enabled !== false);
  const currentParticipant = stageState?.current_participant;
  const currentQuestion = stageState?.selected_question;
  const stageStatus = stageState?.stage_status || 'HOLDING';

  // Dynamic filter dropdown options
  const uniqueGrades = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (p.grade_name_dhivehi) set.add(p.grade_name_dhivehi);
      else if (p.grade_id) set.add(p.grade_id);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [participants]);

  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (p.branch_name_dhivehi) set.add(p.branch_name_dhivehi);
      else if (p.branch_id) set.add(p.branch_id);
    });
    return Array.from(set);
  }, [participants]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (p.category_id) set.add(p.category_id);
    });
    return Array.from(set);
  }, [participants]);

  // Filter participants
  const filteredParticipants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return participants.filter((p) => {
      if (q) {
        const haystack = [
          p.participant_number,
          p.name,
          p.name_dhivehi,
          p.institution,
          p.grade_name_dhivehi || p.grade_id,
          p.branch_name_dhivehi || p.branch_id,
          p.category_id
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterGrade && (p.grade_name_dhivehi !== filterGrade && p.grade_id !== filterGrade)) return false;
      if (filterBranch && (p.branch_name_dhivehi !== filterBranch && p.branch_id !== filterBranch)) return false;
      if (filterCategory && p.category_id !== filterCategory) return false;
      if (filterStatus && p.status?.toUpperCase() !== filterStatus.toUpperCase()) return false;
      return true;
    });
  }, [participants, searchQuery, filterGrade, filterBranch, filterCategory, filterStatus]);

  const activeQueue = useMemo(
    () => filteredParticipants.filter((p) => p.status !== 'Completed'),
    [filteredParticipants]
  );

  const completedQueue = useMemo(
    () => participants.filter((p) => p.status === 'Completed'),
    [participants]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setFilterGrade('');
    setFilterBranch('');
    setFilterCategory('');
    setFilterStatus('');
    setFilterAttendance('');
  };

  // 1. Confirm Call Participant
  const handleCall = (p: Participant, isRecall = false) => {
    setConfirmModal({
      isOpen: true,
      title: isRecall ? 'Recall Participant' : 'ސްޓޭޖަށް ގޮވާ',
      body: (
        <div>
          <div className="stageName text-2xl font-black mb-2">
            #{p.participant_number} {p.name_dhivehi || p.name}
          </div>
          <p className="text-slate-600 font-bold">
            {p.grade_name_dhivehi || p.grade_id} · {p.branch_name_dhivehi || p.branch_id}
          </p>
          {isRecall && (
            <div className="notice warn mt-4">
              Recall opens a fresh scoring attempt while preserving previous attempt history.
            </div>
          )}
        </div>
      ),
      okText: isRecall ? 'Recall' : 'ސްޓޭޖަށް ގޮވާ',
      isDanger: false,
      onConfirm: async () => {
        if (isRecall) {
          await recallParticipant(p.id, 'Recalled by presentation operator');
        } else {
          await callParticipant(p.id);
        }
        showToast('ބައިވެރިޔާ ސްޓޭޖަށް ގޮވައިފި');
        await loadParticipants();
      }
    });
  };

  // 2. Confirm Allow Question Selection
  const handleAllowQuestionSelection = () => {
    if (!currentParticipant) return;
    setConfirmModal({
      isOpen: true,
      title: 'ނަންބަރު ހޮވުމުގެ ހުއްދަ',
      body: (
        <p className="text-lg">
          <b>{currentParticipant.name_dhivehi || currentParticipant.name}</b> އަށް ޕޯޑިއަމުން ސުވާލު ނަންބަރު ހޮވުމުގެ ހުއްދަ ދޭނީތޯ؟
        </p>
      ),
      okText: 'ހުއްދަ ދޭ',
      onConfirm: async () => {
        await allowQuestionSelection();
        showToast('ސުވާލު ނެގުމުގެ ފުރުސަތު ހުޅުވާލައިފި');
      }
    });
  };

  // 3. Confirm Manual / Random Question Selection
  const handleSelectQuestion = (qNum: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ސުވާލު ހޮވާ',
      body: (
        <div className="text-center py-4">
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--emerald)' }}>{qNum}</div>
          <p className="text-slate-700 mt-2 font-bold">މި ސުވާލު ނަންބަރު ހޮވުމަށް ޔަޤީންކުރައްވާތޯ؟</p>
        </div>
      ),
      okText: 'ހޮވާ',
      onConfirm: async () => {
        const res = await selectQuestion(qNum, 'OPERATOR_OVERRIDE');
        if (res.success) {
          showToast(`ސުވާލު ${qNum} ހޮވިއްޖެ`);
        } else {
          showToast(res.error || 'Failed to select question', 'error');
        }
      }
    });
  };

  const handleRandomQuestion = () => {
    const available = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
      (n) => !stageState?.used_question_numbers?.includes(n)
    );
    if (!available.length) {
      showToast('ހުރިހާ ސުވާލެއް ބޭނުންކުރެވިއްޖެ', 'error');
      return;
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    handleSelectQuestion(chosen);
  };

  // Reset a specific previously picked question number
  const handleResetQuestionPrompt = (qNum: string) => {
    setConfirmModal({
      isOpen: true,
      title: `ސުވާލު ނަންބަރު ރީސެޓްކުރުން (#${qNum})`,
      body: (
        <div className="text-center py-4">
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--amber)' }}>{qNum}</div>
          <p className="text-slate-800 font-bold mt-2 text-base font-dhivehi" dir="rtl">
            ކުރިން ހޮވިފައިވާ މި ސުވާލު ނަންބަރު ({qNum}) އަލުން ބޭނުންކުރެވޭ ގޮތަށް ރީސެޓްކުރައްވަނީތޯ؟
          </p>
          <p className="text-xs text-slate-500 font-sans mt-2">
            This will mark Question #{qNum} as available again in the question pool so it can be picked.
          </p>
        </div>
      ),
      okText: 'ރީސެޓް ކުރޭ',
      isDanger: false,
      onConfirm: async () => {
        const res = await resetQuestion(qNum);
        if (res.success) {
          showToast(`ސުވާލު ${qNum} އަލުން ބޭނުންކުރެވޭ ގޮތަށް ރީސެޓްކޮށްފި`);
        } else {
          showToast(res.error || 'Failed to reset question', 'error');
        }
      }
    });
  };

  // Reset the currently selected active question
  const handleResetCurrentQuestion = () => {
    if (!currentQuestion) return;
    const qNum = currentQuestion.question_number;
    setConfirmModal({
      isOpen: true,
      title: 'ހޮވިފައިވާ ސުވާލު ރީސެޓްކުރުން',
      body: (
        <div className="text-center py-4">
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--amber)' }}>{qNum}</div>
          <p className="text-slate-800 font-bold mt-2 text-base font-dhivehi" dir="rtl">
            މިހާރު ހޮވިފައިވާ ސުވާލު ނަންބަރު ({qNum}) ރީސެޓްކޮށް، އަލުން ސުވާލު ހޮވުމުގެ ފުރުސަތު ހުޅުވާލަން ޔަޤީންކުރައްވާތޯ؟
          </p>
          <p className="text-xs text-slate-500 font-sans mt-2">
            This will un-select the question from the stage, return it to the available pool, and re-enable question number selection.
          </p>
        </div>
      ),
      okText: 'ސުވާލު ރީސެޓް ކުރޭ',
      isDanger: true,
      onConfirm: async () => {
        const res = await resetQuestion(qNum);
        if (res.success) {
          showToast(`ހޮވިފައިވާ ސުވާލު (${qNum}) ރީސެޓްކޮށް، ސުވާލު ހޮވުމުގެ ފުރުސަތު އަލުން ހުޅުވާލައިފި`);
        } else {
          showToast(res.error || 'Failed to reset question', 'error');
        }
      }
    });
  };

  // Reset all used questions in pool
  const handleResetAllQuestionsPrompt = () => {
    setConfirmModal({
      isOpen: true,
      title: 'ހުރިހާ ސުވާލު ނަންބަރެއް ރީސެޓްކުރުން',
      body: (
        <div className="text-center py-4">
          <p className="text-slate-800 font-bold text-base font-dhivehi" dir="rtl">
            މި ގިންތީގެ ބޭނުންކުރެވިފައިވާ ހުރިހާ ސުވާލު ނަންބަރުތަކެއް ({stageState?.used_question_numbers?.length || 0} ސުވާލު) އަލުން ބޭނުންކުރެވޭ ގޮތަށް ރީސެޓްކުރަން ޔަޤީންކުރައްވާތޯ؟
          </p>
          <p className="text-xs text-slate-500 font-sans mt-2">
            This will mark all questions in this category pool as available again.
          </p>
        </div>
      ),
      okText: 'ހުރިހާ ނަންބަރެއް ރީސެޓް ކުރޭ',
      isDanger: true,
      onConfirm: async () => {
        const res = await resetQuestion(undefined, undefined, true);
        if (res.success) {
          showToast('ހުރިހާ ސުވާލު ނަންބަރެއް ރީސެޓްކުރެވިއްޖެ');
        } else {
          showToast(res.error || 'Failed to reset all questions', 'error');
        }
      }
    });
  };

  // 4. Confirm Start Performance
  const handleStart = () => {
    setConfirmModal({
      isOpen: true,
      title: 'ފެށުން',
      body: <p className="text-lg">ޕާފޯމަންސް ފަށްޓަވަނީތޯ؟</p>,
      okText: 'ފަށާ',
      onConfirm: async () => {
        await startPerformance();
        showToast('ޕާފޯމަންސް ފެށިއްޖެ');
      }
    });
  };

  // 5. Confirm Finish Performance (with judge marks warning)
  const handleFinish = async () => {
    // Check judges status from server
    let pendingCount = 0;
    let submittedCount = 0;
    let totalJudges = 3;

    try {
      const res = await fetch(`/api/judge/scores/${stageState?.performance_session_id}`);
      if (res.ok) {
        const data = await res.json();
        // Calculate submitted count
      }
    } catch (e) {}

    setConfirmModal({
      isOpen: true,
      title: 'ޕާފޯމަންސް ނިންމާ',
      body: (
        <div>
          <div className="notice warn mb-4">
            <b>މާކްސް ޕެންޑިންގް ވިޔަސް ޕާފޯމަންސް ނިންމާލެވޭނެ.</b>
            <div className="mt-1 text-xs text-slate-600">
              ފަނޑިޔާރުންނަށް ފަހުންވެސް މި ބައިވެރިޔާއަށް މާކްސް ދެވޭނެއެވެ.
            </div>
          </div>
          <p className="font-bold text-slate-800">
            {currentParticipant?.name_dhivehi || currentParticipant?.name} ގެ ޕާފޯމަންސް ނިންމާލަން އެއްބަސްތޯ؟
          </p>
        </div>
      ),
      okText: 'ނިންމާ',
      isDanger: true,
      onConfirm: async () => {
        await finishPerformance();
        showToast('ޕާފޯމަންސް ނިމިއްޖެ');
        await loadParticipants();
      }
    });
  };

  // 6. Mark Ready
  const handleMarkReady = async () => {
    const ok = await setReady();
    if (ok) {
      showToast('ސްޓޭޖް ތައްޔާރުވެއްޖެ (READY)');
    } else {
      showToast(lastError || 'Failed to mark stage ready', 'error');
    }
  };

  // 7. Return to Holding
  const handleReturnHolding = async () => {
    const ok = await returnToHolding();
    if (ok) {
      showToast('ހޯލްޑިންގ އަށް ބަދަލުވެއްޖެ');
      await loadParticipants();
    } else {
      showToast(lastError || 'Failed to return to holding', 'error');
    }
  };

  return (
    <div className="content p-4 md:p-6 max-w-7xl mx-auto">
      {/* State Machine Error Notice */}
      {lastError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-800 text-sm font-bold">
          <span>{lastError}</span>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-900 px-2 py-0.5 rounded border border-red-300 hover:bg-red-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. TOP STAGE STATUS & CONTROLS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current Stage Card */}
        <div className="card">
          <div className="stageHero">
            <div className="avatar">
              {currentParticipant?.participant_number || '—'}
            </div>
            <div>
              <div className="stageName">
                {currentParticipant?.name_dhivehi || currentParticipant?.name || 'ސްޓޭޖު ހުސް'}
              </div>
              <div className="muted text-sm">
                {currentParticipant?.grade_name_dhivehi || currentParticipant?.grade_id || '—'} ·{' '}
                {currentParticipant?.branch_name_dhivehi || currentParticipant?.branch_id || '—'}
                {currentParticipant?.category_id ? ` · ${currentParticipant.category_id}` : ''}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className={`badge ${
                    stageStatus === 'PERFORMING'
                      ? 'green'
                      : stageStatus === 'READY'
                      ? 'green'
                      : stageStatus === 'QUESTION_SELECTED'
                      ? 'blue'
                      : stageStatus === 'QUESTION_SELECTION_ALLOWED'
                      ? 'amber'
                      : stageStatus === 'CALLED'
                      ? 'amber'
                      : stageStatus === 'PERFORMANCE_FINISHED'
                      ? 'purple'
                      : ''
                  }`}
                >
                  {stageStatus}
                </span>
              </div>
            </div>
            <div className="stageNo">
              #{currentParticipant?.participant_number || '—'}
            </div>
          </div>

          {/* Action Button Row */}
          <div className="row mt-4 pt-3 border-t border-slate-100 flex-wrap gap-2">
            <button
              className="btn gold"
              onClick={handleAllowQuestionSelection}
              disabled={!currentParticipant || !canTransitionTo('QUESTION_SELECTION_ALLOWED')}
            >
              ނަންބަރު ހޮވުމުގެ ހުއްދަ
            </button>
            <button
              className="btn ghost"
              onClick={handleRandomQuestion}
              disabled={!currentParticipant || !canTransitionTo('QUESTION_SELECTED')}
            >
              Random
            </button>
            {stageStatus === 'QUESTION_SELECTED' && (
              <button
                className="btn primary"
                onClick={handleMarkReady}
                disabled={!canTransitionTo('READY')}
              >
                ތައްޔާރު (Ready)
              </button>
            )}
            <button
              className="btn primary"
              onClick={handleStart}
              disabled={!canTransitionTo('PERFORMING')}
            >
              ޕާފޯމަންސް ފަށާ
            </button>
            <button
              className="btn danger"
              onClick={handleFinish}
              disabled={!canTransitionTo('PERFORMANCE_FINISHED')}
            >
              ޕާފޯމަންސް ނިންމާ
            </button>
            {stageStatus === 'PERFORMANCE_FINISHED' && (
              <button
                className="btn ghost"
                onClick={handleReturnHolding}
              >
                ހޯލްޑިންގ އަށް
              </button>
            )}
          </div>
        </div>

        {/* Timer & Judge Statuses Card */}
        <div className="card">
          {timerEnabled ? (
            <div className="mb-4 pb-3 border-b border-slate-100">
              <div className="spread">
                <h3 className="font-black text-lg">ޓައިމަރ</h3>
                <div className="timer text-3xl font-mono text-emerald-800">
                  {formatTimer(elapsedSec)}
                </div>
              </div>
              <div className="row mt-2">
                <button
                  className="btn small ghost"
                  onClick={() => pauseResumeTimer('pause')}
                  disabled={stageStatus !== 'PERFORMING'}
                >
                  Pause
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => pauseResumeTimer('resume')}
                  disabled={stageStatus !== 'PERFORMING'}
                >
                  Resume
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4 pb-3 border-b border-slate-100">
              <div className="spread items-center">
                <h3 className="font-black text-lg">ޓައިމަރ</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  DISABLED IN SETTINGS
                </span>
              </div>
              <p className="text-xs text-slate-500 font-sans mt-1">
                Start performance timer is disabled in Competition Settings.
              </p>
            </div>
          )}

          <h3 className="font-black text-lg mb-2">ޖަޖުންގެ ޙާލަތު</h3>
          <div className="space-y-1">
            <div className="judgeState">
              <span className="font-bold text-slate-800">Sheikh Mohamed Latheef (J-01)</span>
              <span className="badge green">READY</span>
            </div>
            <div className="judgeState">
              <span className="font-bold text-slate-800">Usthaza Mariyam Nasheeda (J-02)</span>
              <span className="badge green">READY</span>
            </div>
            <div className="judgeState">
              <span className="font-bold text-slate-800">Qari Ahmed Zaki (J-03)</span>
              <span className="badge green">READY</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. QUESTION NUMBERS GRID & QUESTION PREVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Question Grid */}
        <div className="card">
          <div className="spread mb-3 items-center">
            <div>
              <h3 className="font-black text-lg">ސުވާލު ނަންބަރު</h3>
              <span className="text-[11px] text-slate-500 font-sans block">
                Click number to select; click used (↺) to reset
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {currentQuestion && (
                <button
                  type="button"
                  onClick={handleResetCurrentQuestion}
                  disabled={stageStatus === 'PERFORMING'}
                  className="btn small ghost text-amber-800 border-amber-300 hover:bg-amber-50 text-xs font-bold"
                  title="Reset currently selected question so another can be chosen"
                >
                  ↺ ސުވާލު ރީސެޓް
                </button>
              )}
              {stageState?.used_question_numbers && stageState.used_question_numbers.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetAllQuestionsPrompt}
                  disabled={stageStatus === 'PERFORMING'}
                  className="btn small ghost text-slate-600 hover:bg-slate-100 text-xs font-medium"
                  title="Reset all used questions in pool"
                >
                  ↺ Reset All ({stageState.used_question_numbers.length})
                </button>
              )}
              {currentQuestion && (
                <span className="badge green text-xs">
                  Selected: {currentQuestion.question_number}
                </span>
              )}
            </div>
          </div>

          <div className="questionGrid">
            {Array.from({ length: 10 }, (_, i) => {
              const numStr = String(i + 1).padStart(2, '0');
              const isUsed = stageState?.used_question_numbers?.includes(numStr);
              const isCurrent = currentQuestion?.question_number === numStr;
              return (
                <button
                  key={numStr}
                  className={`qnum ${isUsed ? 'used' : ''} ${isCurrent ? 'current' : ''}`}
                  disabled={stageStatus === 'PERFORMING'}
                  onClick={() => {
                    if (isUsed) {
                      handleResetQuestionPrompt(numStr);
                    } else {
                      handleSelectQuestion(numStr);
                    }
                  }}
                  title={
                    isUsed
                      ? `ސުވާލު #${numStr} ވަނީ ބޭނުންކޮށްފައި. ކްލިކްކޮށްގެން ރީސެޓްކުރައްވާ (Click to reset)`
                      : `ހޮއްވަވާ ސުވާލު #${numStr}`
                  }
                >
                  <span>{numStr}</span>
                  {isUsed && (
                    <span className="block text-[9px] text-amber-700 font-sans mt-0.5 leading-none font-bold">
                      USED ↺
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Question Preview Card */}
        <div className="card">
          <h3 className="font-black text-lg mb-2">ހޮވިފައިވާ ސުވާލު</h3>
          {currentQuestion ? (
            <div>
              <div className="font-bold text-slate-800 text-lg">
                <b>{currentQuestion.surah_name_arabic || currentQuestion.surah_name}</b> · Ayah{' '}
                {currentQuestion.start_ayah} - {currentQuestion.end_ayah}
                {currentQuestion.start_page ? ` · Page ${currentQuestion.start_page}` : ''}
              </div>
              <div
                className="arabic text-2xl mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 max-h-60 overflow-auto"
                dangerouslySetInnerHTML={{
                  __html: renderQuranPassage(
                    currentQuestion.quran_text_arabic ||
                    currentQuestion.quran_text_preview ||
                    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
                  )
                }}
              />
            </div>
          ) : (
            <div className="muted py-8 text-center">ސުވާލެއް ނުހޮވާ</div>
          )}
        </div>
      </div>

      {/* 3. PARTICIPANTS QUEUE & COMPLETED/RECALL CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Left: Participant Queue with Combined Filters */}
        <div className="card">
          <div className="spread mb-2">
            <h3 className="font-black text-lg">ބައިވެރިން</h3>
            <button className="btn ghost small" onClick={loadParticipants}>
              ↻ Refresh
            </button>
          </div>

          <div className="field">
            <input
              id="opSearch"
              placeholder="ނަންބަރު / ނަން / Grade / Branch ހޯދާ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* 3-Column Operator Filter Grid */}
          <div className="operator-filter-grid">
            <div className="field">
              <select
                id="opGrade"
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
              >
                <option value="">ހުރިހާ Grade</option>
                {uniqueGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <select
                id="opBranch"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <option value="">ހުރިހާ Branch</option>
                {uniqueBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <select
                id="opCategory"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">ހުރިހާ Category</option>
                {uniqueCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <select
                id="opStatus"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">ހުރިހާ Status</option>
                <option value="WAITING">WAITING</option>
                <option value="CALLED">CALLED</option>
                <option value="RECALLED">RECALLED</option>
                <option value="PERFORMING">PERFORMING</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>

            <div className="field">
              <select
                id="opAttendance"
                value={filterAttendance}
                onChange={(e) => setFilterAttendance(e.target.value)}
              >
                <option value="">ހުރިހާ Attendance</option>
                <option value="PRESENT">PRESENT</option>
                <option value="ABSENT">ABSENT</option>
              </select>
            </div>

            <button className="btn ghost font-bold" onClick={clearFilters}>
              ފިލްޓަރ ފޮހެލާ
            </button>
          </div>

          <div className="operator-filter-summary">
            <span id="opFilterCount">
              ފެންނަނީ {activeQueue.length} / {participants.length}
            </span>
            <span id="opFilterLabel">
              {[filterGrade, filterBranch, filterCategory, filterStatus].filter(Boolean).join(' · ') || 'ހުރިހާ ބައިވެރިން'}
            </span>
          </div>

          {/* Active Queue List */}
          <div id="opQueue" style={{ maxHeight: 520, overflow: 'auto', marginTop: 10 }}>
            {activeQueue.length > 0 ? (
              activeQueue.map((p) => (
                <div
                  key={p.id}
                  className="spread"
                  style={{ padding: '10px 0', borderBottom: '1px solid #eef2f7' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <b>
                      #{p.participant_number} {p.name_dhivehi || p.name}
                    </b>
                    <div className="muted text-xs">
                      {p.grade_name_dhivehi || p.grade_id} · {p.branch_name_dhivehi || p.branch_id}
                      {p.institution ? ` · ${p.institution}` : ''}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge green">{p.status || 'WAITING'}</span>
                    </div>
                  </div>

                  <button
                    className="btn primary small"
                    onClick={() => handleCall(p, false)}
                    disabled={stageStatus === 'PERFORMING'}
                  >
                    ސްޓޭޖަށް
                  </button>
                </div>
              ))
            ) : (
              <div className="muted py-8 text-center">ފިލްޓަރާ ގުޅޭ ބައިވެރިއަކު ނެތް</div>
            )}
          </div>
        </div>

        {/* Right: Completed Participants and Recall List */}
        <div className="card">
          <div className="spread mb-2">
            <h3 className="font-black text-lg">ނިމިފައިވާ / Recall</h3>
            <span className="badge" id="opCompletedCount">
              {completedQueue.length}
            </span>
          </div>

          <div id="opCompleted" style={{ maxHeight: 520, overflow: 'auto' }}>
            {completedQueue.length > 0 ? (
              completedQueue.map((p) => (
                <div
                  key={p.id}
                  className="spread"
                  style={{ padding: '10px 0', borderBottom: '1px solid #eef2f7' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <b>
                      #{p.participant_number} {p.name_dhivehi || p.name}
                    </b>
                    <div className="muted text-xs">
                      {p.grade_name_dhivehi || p.grade_id} · {p.branch_name_dhivehi || p.branch_id}
                    </div>
                  </div>

                  <button
                    className="btn gold small"
                    onClick={() => handleCall(p, true)}
                    disabled={stageStatus === 'PERFORMING'}
                  >
                    Recall
                  </button>
                </div>
              ))
            ) : (
              <div className="muted py-8 text-center">ނިމިފައިވާ ބައިވެރިއަކު ނެތް</div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="modalOverlay">
          <div className="modal">
            <h2>{confirmModal.title}</h2>
            <div>{confirmModal.body}</div>
            <div className="row justify-end mt-6">
              <button
                className="btn ghost"
                onClick={() => setConfirmModal(null)}
                disabled={actionProcessing}
              >
                ކެންސަލް
              </button>
              <button
                className={`btn ${confirmModal.isDanger ? 'danger' : 'primary'}`}
                disabled={actionProcessing}
                onClick={async () => {
                  setActionProcessing(true);
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } catch (e: any) {
                    showToast(e.message || 'Error occurred', 'error');
                  } finally {
                    setActionProcessing(false);
                  }
                }}
              >
                {actionProcessing ? 'ކުރިއަށްދަނީ...' : confirmModal.okText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast popup */}
      {toastMessage && (
        <div className={`toast ${toastMessage.type === 'error' ? 'error' : 'success'}`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
};
