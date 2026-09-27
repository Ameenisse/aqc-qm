import React, { useState, useEffect, useRef } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { renderQuranPassage, formatQuestionRange } from '../utils/quran';
import { LogOut } from 'lucide-react';

export const AudienceDisplay: React.FC = () => {
  const { stageState, logout, user } = useCompetition();
  const [ratio, setRatio] = useState<'AUTO' | '16:9' | '4:9'>('AUTO');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [finishedElapsedSec, setFinishedElapsedSec] = useState(0);
  const controlsTimerRef = useRef<any>(null);
  const quranScrollRef = useRef<HTMLDivElement>(null);
  const quranTextRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const comp = stageState?.competition;
  const currentParticipant = stageState?.current_participant;
  const currentQuestion = stageState?.selected_question;
  const stageStatus = stageState?.stage_status || 'HOLDING';

  const isHolding = stageStatus === 'HOLDING' || !currentParticipant;
  const isCalling = stageStatus === 'CALLED';
  const isQuestionNumbers = stageStatus === 'QUESTION_SELECTION_ALLOWED';
  const isSelectedOrPerforming =
    stageStatus === 'QUESTION_SELECTED' ||
    stageStatus === 'READY' ||
    stageStatus === 'PERFORMING';
  const isFinished = stageStatus === 'PERFORMANCE_FINISHED';

  // Timer mode & calculation
  const timerEnabled =
    (stageState?.timer_mode || 'stopwatch').toUpperCase() !== 'DISABLED' &&
    (comp?.performance_timer_enabled !== false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!stageState?.timer_started_at) {
      setElapsedSec(stageState?.timer_offset || 0);
      return;
    }
    const interval = setInterval(() => {
      if (stageState.timer_paused_at) return;
      const started = new Date(stageState.timer_started_at!).getTime();
      const diffSec = Math.floor((Date.now() - started) / 1000) + (stageState.timer_offset || 0);
      setElapsedSec(Math.max(0, diffSec));
    }, 500);
    return () => clearInterval(interval);
  }, [stageState?.timer_started_at, stageState?.timer_paused_at, stageState?.timer_offset]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-hide display controls after 2.5s of inactivity
  useEffect(() => {
    const handleActivity = () => {
      setControlsVisible(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2500);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity, { passive: true });
    handleActivity();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Finished screen duration count (default 3 seconds)
  const finishHoldDuration = comp?.finished_screen_duration ?? 3;
  const [showFinishedMessage, setShowFinishedMessage] = useState(false);

  useEffect(() => {
    if (isFinished) {
      setShowFinishedMessage(true);
      const timer = setTimeout(() => {
        setShowFinishedMessage(false);
      }, finishHoldDuration * 1000);
      return () => clearTimeout(timer);
    } else {
      setShowFinishedMessage(false);
    }
  }, [isFinished, finishHoldDuration, stageState?.updated_at]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Auto-fit Quran text to screen without scrollbars or clipped verses
  const autoFitText = () => {
    const wrap = quranScrollRef.current;
    const text = quranTextRef.current;
    if (!wrap || !text) return;

    // Reset styles to calculate natural size
    text.style.fontSize = '';
    text.style.lineHeight = '';

    const availHeight = wrap.clientHeight - 8;
    const availWidth = wrap.clientWidth - 8;
    if (availHeight <= 0 || availWidth <= 0) return;

    const overflowing = () =>
      text.scrollHeight > availHeight || text.scrollWidth > availWidth;

    // Start with font size proportional to container height
    let font = Math.min(64, Math.max(30, Math.floor(availHeight / 4.2)));
    text.style.fontSize = font + 'px';
    text.style.lineHeight = '1.75';

    // Fast step-down if overflowing
    while (overflowing() && font > 14) {
      font -= (font > 34 ? 2 : 1);
      text.style.fontSize = font + 'px';
      if (font < 30) {
        text.style.lineHeight = '1.6';
      }
      if (font < 22) {
        text.style.lineHeight = '1.48';
      }
    }

    // Scale up slightly if ample space remains
    while (!overflowing() && font < 64) {
      font += 1;
      text.style.fontSize = font + 'px';
      if (overflowing()) {
        font -= 1;
        text.style.fontSize = font + 'px';
        break;
      }
    }
  };

  useEffect(() => {
    if (!isSelectedOrPerforming) return;
    const wrap = quranScrollRef.current;
    if (!wrap) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(autoFitText);
    });
    observer.observe(wrap);
    requestAnimationFrame(autoFitText);

    return () => observer.disconnect();
  }, [isSelectedOrPerforming, currentQuestion?.id, currentQuestion?.quran_text_arabic, currentQuestion?.quran_text_preview, ratio]);

  useEffect(() => {
    const handleResize = () => {
      if (isSelectedOrPerforming) {
        requestAnimationFrame(autoFitText);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSelectedOrPerforming]);

  // Add body class for audience mode
  useEffect(() => {
    document.body.classList.add('audience-mode');
    return () => {
      document.body.classList.remove('audience-mode');
    };
  }, []);

  const compTitle = comp?.name_dhivehi || comp?.name || 'އަބާބީލް ޤުރުއާން މުބާރާތް 1446';
  const orgName = comp?.organization_name || 'ޤުރުއާނާބެހޭ ޤައުމީ މަރުކަޒު / Center for Holy Quran';
  const logoUrl = comp?.organization_logo_url || comp?.competition_logo_url || '/app-logo.png';
  const bgUrl = comp?.audience_background_url;
  const bgOverlay = comp?.audience_background_overlay !== undefined && comp?.audience_background_overlay !== null
    ? comp.audience_background_overlay
    : 65;

  const isPortrait = ratio === '4:9';

  return (
    <div
      ref={screenRef}
      id="audienceScreen"
      className={`audience-screen ${isPortrait ? 'ratio-portrait' : ''} ${bgUrl ? 'has-custom-bg' : ''}`}
      style={{
        ...(ratio === '16:9' ? { aspectRatio: '16/9', maxHeight: '100vh', margin: '0 auto' } : {}),
        ...(bgUrl
          ? {
              backgroundImage: `url(${bgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }
          : {})
      }}
    >
      {/* Background Overlay */}
      {bgUrl && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${bgOverlay / 100})`,
            zIndex: 1
          }}
        />
      )}

      <div className="audience-frame relative z-10">
        {/* Top Header - RTL */}
        <div className="audience-header" dir="rtl">
          {/* Right Side in RTL: Branding */}
          <div className="audience-brand">
            {logoUrl ? (
              <img className="audience-brand-logo" src={`${logoUrl}?v=${comp?.updated_at || '1'}`} alt="Logo" />
            ) : (
              <div className="audience-brand-logo">A</div>
            )}
            <div className="audience-brand-text">
              <div className="audience-brand-title">{compTitle}</div>
              <div className="audience-brand-org">{orgName}</div>
            </div>
          </div>

          {/* Left Side in RTL: Display Controls (Auto-hiding) */}
          <div
            id="audienceControls"
            className={`audience-display-controls ${controlsVisible ? '' : 'audience-controls-hidden'}`}
            dir="ltr"
          >
            <button
              className="audience-control-button audience-control-fullscreen"
              onClick={toggleFullscreen}
              title="Fullscreen"
            >
              ⛶
            </button>
            <button
              className={`audience-control-button ${ratio === 'AUTO' ? 'active' : ''}`}
              onClick={() => setRatio('AUTO')}
            >
              Auto
            </button>
            <button
              className={`audience-control-button ${ratio === '16:9' ? 'active' : ''}`}
              onClick={() => setRatio('16:9')}
            >
              16:9
            </button>
            <button
              className={`audience-control-button ${ratio === '4:9' ? 'active' : ''}`}
              onClick={() => setRatio('4:9')}
            >
              4:9
            </button>

            {/* Auto-hide Logout Button */}
            <button
              className="audience-control-button"
              onClick={logout}
              title="Logout / ފޭބުން"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#ffe4e6',
                color: '#9f1239',
                borderColor: '#fda4af',
                cursor: 'pointer'
              }}
            >
              <LogOut size={13} />
              <span>ފޭބުން / Logout</span>
            </button>
          </div>
        </div>

        {/* Center Broadcast Content */}
        <div id="audienceStage" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* 1. FINISHED SCREEN (Shown for configured duration, then returns to Holding) */}
          {isFinished && showFinishedMessage ? (
            <div className="audience-finished">
              <div className="audience-finished-text">
                {comp?.finished_performance_text || 'ނިމުނީ / PERFORMANCE FINISHED'}
              </div>
            </div>
          ) : isHolding || (!showFinishedMessage && isFinished) ? (
            /* 2. HOLDING SCREEN */
            <div className="audience-holding">
              <div className="audience-holding-content">
                {logoUrl ? (
                  <img className="audience-holding-logo" src={`${logoUrl}?v=${comp?.updated_at || '1'}`} alt="Logo" />
                ) : (
                  <div
                    className="audience-brand-logo mx-auto mb-5"
                    style={{ width: 100, height: 100, fontSize: 48, borderRadius: 28 }}
                  >
                    A
                  </div>
                )}
                <div className="audience-holding-title">{compTitle}</div>
                <div className="audience-holding-org">{orgName}</div>
              </div>
            </div>
          ) : (
            /* 3. PARTICIPANT ACTIVE STAGES */
            <>
              {isSelectedOrPerforming ? (
                /* When Question Show:
                   - In one single compact row:
                     * Participant details on the RIGHT side (small size)
                     * Question details on the LEFT side
                   - Question text shrink-fits to remaining screen */
                <>
                  <div className="audience-performer-bar" dir="rtl">
                    {/* Right side: Participant details in small size */}
                    <div className="audience-bar-participant">
                      <span className="audience-bar-name">
                        {currentParticipant?.name_dhivehi || currentParticipant?.name}
                      </span>
                      {currentParticipant?.participant_number && (
                        <span className="audience-bar-pill pill-num">
                          #{currentParticipant.participant_number}
                        </span>
                      )}
                      {currentParticipant?.grade_name_dhivehi && (
                        <span className="audience-bar-pill pill-grade">
                          {currentParticipant.grade_name_dhivehi}
                        </span>
                      )}
                      {currentParticipant?.branch_name_dhivehi && (
                        <span className="audience-bar-meta">
                          · {currentParticipant.branch_name_dhivehi}
                        </span>
                      )}
                      {currentParticipant?.institution && (
                        <span className="audience-bar-meta">
                          · {currentParticipant.institution}
                        </span>
                      )}
                    </div>

                    {/* Left side: Question details and timer */}
                    <div className="audience-bar-question">
                      {currentQuestion?.question_number && (
                        <span className="audience-bar-pill pill-question">
                          ސުވާލު {currentQuestion.question_number}
                        </span>
                      )}
                      {currentQuestion && (
                        <div className="audience-bar-qinfo">
                          <span className="audience-bar-surah">
                            {currentQuestion.surah_name_arabic || currentQuestion.surah_name}
                          </span>
                          <span className="audience-bar-range">
                            {formatQuestionRange({
                              surah_name: currentQuestion.surah_name_arabic || currentQuestion.surah_name,
                              start_surah_name: currentQuestion.start_surah_name || currentQuestion.surah_name_arabic || currentQuestion.surah_name,
                              end_surah_name: currentQuestion.end_surah_name || currentQuestion.surah_name_arabic || currentQuestion.surah_name,
                              start_ayah: currentQuestion.start_ayah,
                              end_ayah: currentQuestion.end_ayah
                            })}
                            {currentQuestion.start_page ? ` · Page ${currentQuestion.start_page}` : ''}
                          </span>
                        </div>
                      )}
                      {stageStatus === 'PERFORMING' && timerEnabled && (
                        <div className="audience-bar-timer">
                          {formatTimer(elapsedSec)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question Display Panel: Takes up the remaining screen, shrink-fitted */}
                  <div className="audience-quran-panel">
                    <div ref={quranScrollRef} className="audience-quran-scroll">
                      <div
                        ref={quranTextRef}
                        className="audience-quran-text"
                        dangerouslySetInnerHTML={{
                          __html: renderQuranPassage(
                            currentQuestion?.quran_text_arabic ||
                            currentQuestion?.quran_text_preview ||
                            'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
                          )
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : isCalling ? (
                /* Called: Welcome participant */
                <>
                  <div className="audience-performer-bar" dir="rtl">
                    <div className="audience-bar-participant">
                      <span className="audience-bar-name">
                        {currentParticipant?.name_dhivehi || currentParticipant?.name}
                      </span>
                      {currentParticipant?.participant_number && (
                        <span className="audience-bar-pill pill-num">
                          #{currentParticipant.participant_number}
                        </span>
                      )}
                      {currentParticipant?.grade_name_dhivehi && (
                        <span className="audience-bar-pill pill-grade">
                          {currentParticipant.grade_name_dhivehi}
                        </span>
                      )}
                      {currentParticipant?.branch_name_dhivehi && (
                        <span className="audience-bar-meta">
                          · {currentParticipant.branch_name_dhivehi}
                        </span>
                      )}
                      {currentParticipant?.institution && (
                        <span className="audience-bar-meta">
                          · {currentParticipant.institution}
                        </span>
                      )}
                    </div>
                    <div className="audience-bar-question">
                      <span className="audience-bar-pill pill-question" style={{ backgroundColor: '#047857' }}>
                        ތައްޔާރުވަނީ / Stage Called
                      </span>
                    </div>
                  </div>
                  <div className="audience-holding">
                    <div className="audience-holding-content">
                      <div style={{ fontSize: 'clamp(40px,5.2vw,76px)', fontWeight: 900 }}>
                        {currentParticipant?.name_dhivehi || currentParticipant?.name}
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 'clamp(22px,2.6vw,40px)',
                          color: 'var(--emerald)',
                          fontWeight: 800
                        }}
                      >
                        #{currentParticipant?.participant_number}
                      </div>
                      {currentParticipant?.institution && (
                        <div style={{ marginTop: 8, fontSize: 'clamp(16px, 1.8vw, 24px)', color: '#475569', fontWeight: 600 }}>
                          {currentParticipant.institution}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : isQuestionNumbers ? (
                /* Question Numbers Grid on Audience Screen */
                <>
                  <div className="audience-performer-bar" dir="rtl">
                    <div className="audience-bar-participant">
                      <span className="audience-bar-name">
                        {currentParticipant?.name_dhivehi || currentParticipant?.name}
                      </span>
                      {currentParticipant?.participant_number && (
                        <span className="audience-bar-pill pill-num">
                          #{currentParticipant.participant_number}
                        </span>
                      )}
                      {currentParticipant?.grade_name_dhivehi && (
                        <span className="audience-bar-pill pill-grade">
                          {currentParticipant.grade_name_dhivehi}
                        </span>
                      )}
                      {currentParticipant?.branch_name_dhivehi && (
                        <span className="audience-bar-meta">
                          · {currentParticipant.branch_name_dhivehi}
                        </span>
                      )}
                    </div>
                    <div className="audience-bar-question">
                      <span className="audience-bar-pill pill-question">
                        ސުވާލު ނަންބަރު ހޮވުން
                      </span>
                    </div>
                  </div>
                  <div className="audience-question-grid-wrap">
                    <div className="audience-question-grid-title">
                      ސުވާލު ނަންބަރު ހޮވައްވާ
                    </div>
                    <div className="questionGrid max-w-4xl mx-auto w-full px-4">
                      {Array.from({ length: 10 }, (_, i) => {
                        const numStr = String(i + 1).padStart(2, '0');
                        const isUsed = stageState?.used_question_numbers?.includes(numStr);
                        return (
                          <button
                            key={numStr}
                            className={`qnum ${isUsed ? 'used' : ''}`}
                            disabled={true}
                          >
                            {numStr}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
