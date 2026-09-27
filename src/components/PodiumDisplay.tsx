import React, { useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { renderQuranPassage } from '../utils/quran';

export const PodiumDisplay: React.FC = () => {
  const { stageState, selectQuestion } = useCompetition();
  const [quranZoom, setQuranZoom] = useState(1);
  const [confirmModalNum, setConfirmModalNum] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const comp = stageState?.competition;
  const currentParticipant = stageState?.current_participant;
  const currentQuestion = stageState?.selected_question;
  const stageStatus = stageState?.stage_status || 'HOLDING';

  const isHolding = stageStatus === 'HOLDING' || !currentParticipant;
  const isSelectionAllowed = stageStatus === 'QUESTION_SELECTION_ALLOWED';
  const isSelectedOrPerforming =
    stageStatus === 'QUESTION_SELECTED' ||
    stageStatus === 'READY' ||
    stageStatus === 'PERFORMING';
  const isFinished = stageStatus === 'PERFORMANCE_FINISHED';

  // Branch type: Hifz (no Quran text on podium) vs Tilawa (show Quran passage)
  const isHifz =
    currentParticipant?.branch_type === 'HIFZ' ||
    String(currentParticipant?.branch_name_dhivehi || '').includes('ނުބަލާ') ||
    String(currentParticipant?.branch_name_dhivehi || '').includes('ނުބަ');

  const showQuranTextOnPodium =
    !isHifz && (comp?.tilawa_podium_quran_visibility ?? true);

  // Timer mode & calculation
  const timerEnabled = (stageState?.timer_mode || 'stopwatch').toUpperCase() !== 'DISABLED';
  const [elapsedSec, setElapsedSec] = useState(0);

  React.useEffect(() => {
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

  const changeZoom = (delta: number) => {
    setQuranZoom((prev) => Math.min(1.8, Math.max(0.65, prev + delta)));
  };

  const handleSelectConfirm = async () => {
    if (!confirmModalNum || submitting) return;
    setSubmitting(true);
    setErrorMessage('');

    const res = await selectQuestion(confirmModalNum, 'PODIUM');
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to select question.');
    } else {
      setConfirmModalNum(null);
    }
    setSubmitting(false);
  };

  return (
    <div className="podium">
      <div id="podiumStage">
        {/* 1. HOLDING / NO PARTICIPANT */}
        {isHolding && (
          <div className="card text-center py-16 max-w-xl mx-auto">
            <div className="stageHero justify-center mb-6" style={{ display: 'flex' }}>
              <img
                src="/app-logo.png"
                alt="Ababil Quran Competition Logo"
                className="w-20 h-20 rounded-2xl object-contain shadow-md border-2 border-emerald-300 bg-white p-1"
              />
            </div>
            <h2 className="text-3xl font-black mb-2">
              {comp?.name_dhivehi || 'އަބާބީލް ޤުރުއާން މުބާރާތް'}
            </h2>
            <p className="text-lg text-slate-600 mb-6">
              {comp?.organization_name || 'ޤުރުއާނާބެހޭ ޤައުމީ މަރުކަޒު'}
            </p>
            <div className="notice text-center font-bold">
              ސްޓޭޖަށް ބައިވެރިއަކު ގޮވުމުގެ އިންތިޒާރުގައި
            </div>
          </div>
        )}

        {/* 2. FINISHED STATE */}
        {isFinished && (
          <div className="card text-center py-20 max-w-xl mx-auto">
            <div className="text-5xl font-black text-emerald-800 mb-4">
              {comp?.finished_performance_text || 'ނިމިއްޖެ'}
            </div>
            <div className="text-xl font-bold text-slate-600">ޝުކުރިއްޔާ</div>
          </div>
        )}

        {/* 3. CALLED / BEFORE QUESTION PERMISSION */}
        {!isHolding && !isFinished && !isSelectionAllowed && !isSelectedOrPerforming && currentParticipant && (
          <div className="card max-w-2xl mx-auto">
            <div className="stageHero">
              <div className="avatar">
                {currentParticipant.participant_number}
              </div>
              <div>
                <div className="stageName">{currentParticipant.name_dhivehi || currentParticipant.name}</div>
                <div className="muted text-base">
                  {currentParticipant.grade_name_dhivehi || currentParticipant.grade_id} ·{' '}
                  {currentParticipant.branch_name_dhivehi || currentParticipant.branch_id}
                </div>
                <div className="text-xs text-slate-500 mt-1">{currentParticipant.institution}</div>
              </div>
              <div className="stageNo">#{currentParticipant.participant_number}</div>
            </div>

            <div className="notice warn mt-8 text-center font-bold text-lg">
              ސުވާލު ނަންބަރު ހޮވުމަށް އިންތިޒާރު ކުރައްވާ
            </div>
          </div>
        )}

        {/* 4. QUESTION SELECTION ALLOWED (Touch-friendly Question Grid) */}
        {!isHolding && !isFinished && isSelectionAllowed && currentParticipant && (
          <div className="card max-w-4xl mx-auto">
            <div className="stageHero">
              <div className="avatar">
                {currentParticipant.participant_number}
              </div>
              <div>
                <div className="stageName">{currentParticipant.name_dhivehi || currentParticipant.name}</div>
                <div className="muted text-base">
                  {currentParticipant.grade_name_dhivehi || currentParticipant.grade_id} ·{' '}
                  {currentParticipant.branch_name_dhivehi || currentParticipant.branch_id}
                </div>
              </div>
              <div className="stageNo">#{currentParticipant.participant_number}</div>
            </div>

            <h2 className="text-center mt-6 text-2xl font-black">
              ސުވާލު ނަންބަރު ހޮވައްވާ
            </h2>

            {errorMessage && (
              <div className="notice danger text-center font-bold mb-4">{errorMessage}</div>
            )}

            <div className="questionGrid mt-4">
              {Array.from({ length: 10 }, (_, i) => {
                const numStr = String(i + 1).padStart(2, '0');
                const isUsed = stageState?.used_question_numbers?.includes(numStr);
                return (
                  <button
                    key={numStr}
                    className={`qnum ${isUsed ? 'used' : ''}`}
                    disabled={isUsed || submitting}
                    onClick={() => setConfirmModalNum(numStr)}
                  >
                    {numStr}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. QUESTION SELECTED / PERFORMING */}
        {!isHolding && !isFinished && isSelectedOrPerforming && (
          <div className="max-w-4xl mx-auto">
            {showQuranTextOnPodium && currentQuestion ? (
              /* TILAWA: Quran passage with Zoom Controls */
              <div className="card">
                <div className="spread">
                  <h2 className="text-2xl font-black">
                    ސުވާލު {currentQuestion.question_number}
                  </h2>
                  {stageStatus === 'PERFORMING' && timerEnabled && (
                    <div className="timer font-mono text-3xl font-black text-emerald-800">
                      {formatTimer(elapsedSec)}
                    </div>
                  )}
                </div>

                <div className="zoomBar">
                  <button className="btn ghost small font-bold" onClick={() => changeZoom(-0.12)}>
                    A-
                  </button>
                  <button className="btn ghost small font-bold" onClick={() => changeZoom(0.12)}>
                    A+
                  </button>
                </div>

                <div
                  id="podiumQuran"
                  className="arabic"
                  style={{
                    fontSize: `${2.3 * quranZoom}rem`,
                    textAlign: 'center',
                    marginTop: 12
                  }}
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
              /* HIFZ: Question info only, NO Quran passage or clues */
              <div className="card text-center py-16">
                <div className="stageNo text-7xl font-black mb-4">
                  {currentQuestion?.question_number ? `ސުވާލު ${currentQuestion.question_number}` : ''}
                </div>
                <div className="text-3xl font-black text-slate-800 mb-2">
                  ހިތުން ކިޔާނެ ސުވާލެއް
                </div>
                <div className="text-slate-500 font-bold text-lg mb-6">
                  ޤުރުއާން ނަސް މި ސްކްރީންގައި ނުދައްކާނެއެވެ.
                </div>
                {stageStatus === 'PERFORMING' && timerEnabled && (
                  <div className="timer font-mono text-4xl font-black text-emerald-800">
                    {formatTimer(elapsedSec)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Question selection on Podium */}
      {confirmModalNum && (
        <div className="modalOverlay">
          <div className="modal max-w-sm text-center">
            <h2>ސުވާލު ނަންބަރު</h2>
            <div style={{ fontSize: 56, fontWeight: 900, textAlign: 'center', color: 'var(--emerald)' }}>
              {confirmModalNum}
            </div>
            <p className="text-lg font-bold text-slate-700 mt-2">
              މި ނަންބަރު ހޮވައްވަނީތޯ؟
            </p>
            <div className="row justify-center mt-6">
              <button
                className="btn ghost"
                onClick={() => setConfirmModalNum(null)}
                disabled={submitting}
              >
                ކެންސަލް
              </button>
              <button
                className="btn primary"
                onClick={handleSelectConfirm}
                disabled={submitting}
              >
                {submitting ? 'ހޮވަނީ...' : 'ހޮވާ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
