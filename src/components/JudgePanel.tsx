import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { DigitalMushaf } from './DigitalMushaf';
import { renderQuranPassage } from '../utils/quran';

interface Deduction {
  criterion_id: string;
  value: number;
  reason?: string;
}

export const JudgePanel: React.FC = () => {
  const { user, stageState, triggerBell } = useCompetition();

  const [showMushaf, setShowMushaf] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Ongoing performance session from stage
  const ongoingSessionId = stageState?.performance_session_id;

  // Track completed performances
  const [completedList, setCompletedList] = useState<any[]>([]);
  const [sessionDetail, setSessionDetail] = useState<any>(null);

  // Active form inputs kept in local state so polling NEVER disrupts typing
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Confirmation modal for final submission
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Ref to track which session is loaded in the form
  const loadedSessionIdRef = useRef<string | null>(null);

  const judgeId = user?.judge_id || 'j-1';
  const canBell = Boolean(user?.can_trigger_stage_bells || user?.role === 'ADMIN');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. Initial selection: if no session open, select ongoing session if present
  useEffect(() => {
    if (!selectedSessionId && ongoingSessionId) {
      setSelectedSessionId(ongoingSessionId);
    }
  }, [ongoingSessionId]);

  // 2. Fetch completed list
  const fetchCompletedList = async () => {
    try {
      const res = await fetch(`/api/judge/completed-performances?judge_id=${judgeId}`);
      if (res.ok) {
        const data = await res.json();
        setCompletedList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCompletedList();
    const interval = setInterval(fetchCompletedList, 4000);
    return () => clearInterval(interval);
  }, [judgeId]);

  // 3. Fetch session details when selectedSessionId changes
  const fetchSessionDetails = async (sessId: string, forceReset = false) => {
    try {
      const res = await fetch(`/api/judge/scores/${sessId}?judge_id=${judgeId}`);
      if (res.ok) {
        const data = await res.json();
        setSessionDetail(data);

        // Only populate form inputs if switching sessions or force resetting
        if (loadedSessionIdRef.current !== sessId || forceReset) {
          loadedSessionIdRef.current = sessId;

          const savedScores: Record<string, number> = {};
          if (data.score?.criteria_scores) {
            data.score.criteria_scores.forEach((cs: any) => {
              savedScores[cs.criterion_id] = cs.points_awarded;
            });
          } else {
            // Default to max starting points
            (data.rubric?.criteria || []).forEach((c: any) => {
              savedScores[c.id] = c.starting_points ?? c.max_points ?? 30;
            });
          }
          setCriteriaScores(savedScores);

          if (data.score?.deductions) {
            setDeductions(
              data.score.deductions.map((d: any) => ({
                criterion_id: d.criterion_id,
                value: Math.abs(d.value),
                reason: d.reason
              }))
            );
          } else {
            setDeductions([]);
          }

          setNotes(data.score?.notes || '');
          setIsSubmitted(data.score?.status === 'SUBMITTED');
        }
      }
    } catch (e) {
      console.error('Failed to load session details:', e);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionDetails(selectedSessionId);
    }
  }, [selectedSessionId, judgeId]);

  // Handle score calculations
  const criteriaList = sessionDetail?.rubric?.criteria || [];

  const subtotal = useMemo(() => {
    return Object.values(criteriaScores).reduce((acc, val) => acc + (Number(val) || 0), 0);
  }, [criteriaScores]);

  const deductionTotal = useMemo(() => {
    return deductions.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
  }, [deductions]);

  const finalTotal = useMemo(() => {
    return Math.max(0, subtotal - deductionTotal).toFixed(1);
  }, [subtotal, deductionTotal]);

  // Quick deduction chip click
  const handleAddDeduction = (criterionId: string, val: number) => {
    if (isSubmitted) return;
    setDeductions((prev) => [
      ...prev,
      { criterion_id: criterionId, value: val, reason: 'Quick deduction' }
    ]);
  };

  // Save draft
  const handleSaveDraft = async (silent = false) => {
    if (!selectedSessionId || isSubmitted) return;
    setIsSaving(true);
    try {
      const deductionItems = deductions.map((d) => ({
        criterion_id: d.criterion_id,
        value: -Math.abs(d.value),
        reason: d.reason || 'Deduction'
      }));

      const res = await fetch('/api/judge/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performance_session_id: selectedSessionId,
          participant_id: sessionDetail?.participant?.id,
          judge_id: judgeId,
          rubric_id: sessionDetail?.rubric?.id,
          criteria_scores: criteriaScores,
          deductions: deductionItems,
          notes
        })
      });

      if (res.ok) {
        if (!silent) showToast('Draft saved');
      }
    } catch (e) {
      if (!silent) showToast('Failed to save draft', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit final score
  const handleSubmitMarks = async () => {
    if (!selectedSessionId || isSubmitted) return;
    setIsSaving(true);
    try {
      const deductionItems = deductions.map((d) => ({
        criterion_id: d.criterion_id,
        value: -Math.abs(d.value),
        reason: d.reason || 'Deduction'
      }));

      const res = await fetch('/api/judge/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performance_session_id: selectedSessionId,
          participant_id: sessionDetail?.participant?.id,
          judge_id: judgeId,
          rubric_id: sessionDetail?.rubric?.id,
          criteria_scores: criteriaScores,
          deductions: deductionItems,
          notes
        })
      });

      if (res.ok) {
        setIsSubmitted(true);
        setShowSubmitModal(false);
        showToast('Marks submitted successfully');
        await fetchCompletedList();
      } else {
        showToast('Submission error', 'error');
      }
    } catch (e) {
      showToast('Error submitting score', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Separate submitted and pending from completed list
  const pendingReviewList = completedList.filter((c) => c.status !== 'SUBMITTED');
  const submittedList = completedList.filter((c) => c.status === 'SUBMITTED');

  // Check if a new participant is ongoing on stage while judge is scoring someone else
  const hasNewParticipantOnStage =
    ongoingSessionId &&
    selectedSessionId &&
    ongoingSessionId !== selectedSessionId;

  return (
    <div className="content p-4 md:p-6 max-w-7xl mx-auto">
      {/* Notice Banner if new participant on stage while viewing older */}
      {hasNewParticipantOnStage && (
        <div className="notice warn mb-4 spread">
          <div className="font-bold">
            އައު ބައިވެރިއެއް ސްޓޭޖަށް ގޮވައިފި (
            #{stageState?.current_participant?.participant_number}{' '}
            {stageState?.current_participant?.name_dhivehi || stageState?.current_participant?.name})
          </div>
          <button
            className="btn small primary"
            onClick={() => setSelectedSessionId(ongoingSessionId)}
          >
            Open Current
          </button>
        </div>
      )}

      {/* Row 1: On-going Participant Card + Warning Bell Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: On-going */}
        <div className="card">
          <div className="spread mb-2">
            <h2 className="text-xl font-black">On-going / މިހާރު ސްޓޭޖުގައި</h2>
            {stageState?.stage_status && (
              <span className="badge green">{stageState.stage_status}</span>
            )}
          </div>

          {stageState?.current_participant ? (
            <div>
              <div className="stageName text-2xl font-black">
                #{stageState.current_participant.participant_number}{' '}
                {stageState.current_participant.name_dhivehi || stageState.current_participant.name}
              </div>
              <div className="muted text-sm mt-1">
                {stageState.current_participant.grade_name_dhivehi || stageState.current_participant.grade_id} ·{' '}
                {stageState.current_participant.branch_name_dhivehi || stageState.current_participant.branch_id}
              </div>
              <div className="mt-2 font-bold text-slate-800">
                Question: <b>{stageState.selected_question?.question_number || '—'}</b>
              </div>

              {ongoingSessionId && ongoingSessionId !== selectedSessionId && (
                <button
                  className="btn primary small mt-3"
                  onClick={() => setSelectedSessionId(ongoingSessionId)}
                >
                  މާކްސް ދޭ
                </button>
              )}
            </div>
          ) : (
            <div className="muted py-6">ސްޓޭޖު ހުސް</div>
          )}
        </div>

        {/* Card 2: Warning Bell Controls */}
        <div className="card">
          <h2 className="text-xl font-black mb-3">Warning Bell / އިންޒާރުގެ ރަނގަބީލު</h2>
          {canBell ? (
            <div className="row">
              <button
                className="btn warn bellBtn"
                onClick={() => triggerBell('FIRST_WARNING')}
              >
                🔔 1 (Single)
              </button>
              <button
                className="btn danger bellBtn"
                onClick={() => triggerBell('FINAL_WARNING')}
              >
                🔔🔔 2 (Double)
              </button>
              <button
                className="btn ghost bellBtn"
                onClick={() => triggerBell('STOP')}
              >
                ⏹ Stop
              </button>
            </div>
          ) : (
            <div className="muted py-4">Bell permission not assigned to this account.</div>
          )}
        </div>
      </div>

      {/* Row 2: Active Scoring Card (Left) + Completed/Pending & Submitted Lists (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Left: Active Scoring Session */}
        <div>
          {sessionDetail ? (
            <div className="card">
              <div className="spread mb-3">
                <div>
                  <h2 className="text-2xl font-black mb-1">
                    #{sessionDetail.participant?.participant_number}{' '}
                    {sessionDetail.participant?.name_dhivehi || sessionDetail.participant?.name}
                  </h2>
                  <div className="muted text-xs">
                    {sessionDetail.participant?.grade_name_dhivehi || sessionDetail.participant?.grade_id} ·{' '}
                    {sessionDetail.participant?.branch_name_dhivehi || sessionDetail.participant?.branch_id} ·{' '}
                    Q {sessionDetail.question?.question_number || '—'}
                  </div>
                </div>
                <span className={`badge ${isSubmitted ? 'green' : 'amber'}`}>
                  {isSubmitted ? 'SUBMITTED' : 'DRAFT'}
                </span>
              </div>

              {/* Arabic Quran Preview with Mushaf and Page/Juz pill */}
              {sessionDetail.question && (
                <div className="mb-4">
                  <div className="spread mb-2">
                    <button
                      className="btn ghost small"
                      onClick={() => setShowMushaf(true)}
                    >
                      މުސްޙަފް
                    </button>
                    <span className="badge">
                      Page {sessionDetail.question.start_page || '—'} · Juz{' '}
                      {sessionDetail.question.juz || '—'}
                    </span>
                  </div>

                  <div
                    className="arabic text-2xl p-4 bg-slate-50 border border-slate-200 rounded-xl max-h-60 overflow-auto"
                    dangerouslySetInnerHTML={{
                      __html: renderQuranPassage(
                        sessionDetail.question.quran_text_arabic ||
                        sessionDetail.question.quran_text_preview ||
                        'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
                      )
                    }}
                  />
                </div>
              )}

              {/* Rubric Criteria and Deduction Chips */}
              <div className="space-y-3">
                {criteriaList.map((c: any) => {
                  const maxPts = c.starting_points ?? c.max_points ?? 30;
                  const currentScore = criteriaScores[c.id] ?? maxPts;

                  return (
                    <div key={c.id} className="scoreCard">
                      <div className="spread">
                        <div>
                          <b className="text-slate-800 text-base">
                            {c.name_dhivehi || c.name}
                          </b>
                          <div className="muted text-xs">Max: {maxPts}</div>
                        </div>
                        <input
                          disabled={isSubmitted}
                          className="scoreInput criterionInput"
                          type="number"
                          min="0"
                          max={maxPts}
                          step="0.5"
                          value={currentScore}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCriteriaScores({ ...criteriaScores, [c.id]: val });
                          }}
                        />
                      </div>

                      {/* Quick deduction chips */}
                      {!isSubmitted && (
                        <div className="row mt-2">
                          <button
                            className="deductChip"
                            onClick={() => handleAddDeduction(c.id, 0.5)}
                          >
                            -0.5
                          </button>
                          <button
                            className="deductChip"
                            onClick={() => handleAddDeduction(c.id, 1)}
                          >
                            -1
                          </button>
                          <button
                            className="deductChip"
                            onClick={() => handleAddDeduction(c.id, 2)}
                          >
                            -2
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes Field */}
              <div className="field mt-3">
                <label className="text-xs font-bold text-slate-600">ނޯޓްސް / Notes</label>
                <textarea
                  disabled={isSubmitted}
                  rows={2}
                  className="p-2 border border-slate-300 rounded-xl text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional judging notes or observations..."
                />
              </div>

              {/* Deductions Summary */}
              {deductions.length > 0 && (
                <div className="mt-3 p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <b>Deductions:</b>{' '}
                  {deductions.map((d, i) => `-${d.value}`).join(', ')} = -{deductionTotal} pts
                </div>
              )}

              {/* Final Score Total */}
              <div className="spread mt-4 pt-3 border-t border-slate-200 text-2xl font-black">
                <span>Final</span>
                <span className="text-emerald-800 font-mono">{finalTotal}</span>
              </div>

              {/* Save Draft / Submit Marks Actions */}
              {isSubmitted ? (
                <div className="notice mt-4 text-center font-bold">
                  މާކްސް ސަބްމިޓްކޮށްފައި (Submitted)
                </div>
              ) : (
                <div className="row mt-4 pt-2">
                  <button
                    className="btn ghost"
                    onClick={() => handleSaveDraft(false)}
                    disabled={isSaving}
                  >
                    Save Draft
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => setShowSubmitModal(true)}
                    disabled={isSaving}
                  >
                    Submit Marks
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12">
              <div className="muted font-bold text-lg">މާކްސް ދިނުމަށް ބައިވެރިއެއް ހޮވާ.</div>
            </div>
          )}
        </div>

        {/* Right: Completed / Pending Marks + Submitted Lists */}
        <div className="space-y-4">
          {/* Card 1: Completed / Pending Marks */}
          <div className="card">
            <h3 className="font-black text-lg mb-2">Completed / Pending Marks</h3>
            {pendingReviewList.length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-60 overflow-auto">
                {pendingReviewList.map((x) => (
                  <div key={x.session_id} className="spread py-2.5">
                    <div>
                      <b>
                        #{x.participant_number} {x.name_dhivehi || x.name}
                      </b>
                      <div className="muted text-xs">
                        Q {x.question_number || '—'} · {x.grade_name_dhivehi || x.grade_id}
                      </div>
                    </div>
                    <button
                      className="btn gold small"
                      onClick={() => setSelectedSessionId(x.session_id)}
                    >
                      {x.status === 'DRAFT' ? 'Continue' : 'Give Marks'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted py-4 text-center">No pending marks</div>
            )}
          </div>

          {/* Card 2: Submitted Marks */}
          <div className="card">
            <h3 className="font-black text-lg mb-2">Submitted</h3>
            {submittedList.length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-60 overflow-auto">
                {submittedList.map((x) => (
                  <div key={x.session_id} className="spread py-2">
                    <div>
                      <span className="font-bold text-slate-800">
                        #{x.participant_number} {x.name_dhivehi || x.name}
                      </span>
                      <span className="text-xs text-slate-500 mr-2">
                        ({x.final_score ?? '—'} pts)
                      </span>
                    </div>
                    <span className="badge green">SUBMITTED</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted py-4 text-center">No submitted marks</div>
            )}
          </div>
        </div>
      </div>

      {/* Digital Mushaf Modal */}
      {showMushaf && (
        <DigitalMushaf
          initialPage={sessionDetail?.question?.start_page || 1}
          onClose={() => setShowMushaf(false)}
        />
      )}

      {/* Confirm Final Submit Modal */}
      {showSubmitModal && (
        <div className="modalOverlay">
          <div className="modal max-w-md">
            <h2>މާކްސް ސަބްމިޓް</h2>
            <div className="stageName text-xl font-bold mb-2">
              #{sessionDetail?.participant?.participant_number}{' '}
              {sessionDetail?.participant?.name_dhivehi || sessionDetail?.participant?.name}
            </div>
            <p className="text-lg">
              Final Score: <b className="text-emerald-800 text-2xl">{finalTotal}</b>
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Are you sure you want to submit the official marks for this participant?
            </p>
            <div className="row justify-end mt-6">
              <button
                className="btn ghost"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSaving}
              >
                ކެންސަލް
              </button>
              <button
                className="btn primary"
                onClick={handleSubmitMarks}
                disabled={isSaving}
              >
                {isSaving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className={`toast ${toastMsg.type === 'error' ? 'error' : 'success'}`}>
          {toastMsg.text}
        </div>
      )}
    </div>
  );
};
