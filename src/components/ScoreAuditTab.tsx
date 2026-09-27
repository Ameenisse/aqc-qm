import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Scale,
  Award,
  ChevronDown,
  Eye,
  X,
  FileText
} from 'lucide-react';
import { ScoreAuditEvent, ScoreAuditSummary, Judge, Participant } from '../types';

interface ScoreAuditTabProps {
  judges: Judge[];
  participants: Participant[];
}

export const ScoreAuditTab: React.FC<ScoreAuditTabProps> = ({ judges, participants }) => {
  const [events, setEvents] = useState<ScoreAuditEvent[]>([]);
  const [summary, setSummary] = useState<ScoreAuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJudge, setSelectedJudge] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [selectedParticipant, setSelectedParticipant] = useState<string>('ALL');

  // Selected event for detail inspection modal
  const [inspectEvent, setInspectEvent] = useState<ScoreAuditEvent | null>(null);

  const fetchScoreAuditData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/score-audit');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEvents(data.events || []);
      setSummary(data.summary || null);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load score audit logs:', err);
      setError(err?.message || 'Failed to load score audit trail');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchScoreAuditData();

    // Auto-refresh interval every 8 seconds for live scoring monitoring
    const timer = setInterval(() => {
      fetchScoreAuditData();
    }, 8000);

    return () => clearInterval(timer);
  }, []);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Judge filter
      if (selectedJudge !== 'ALL' && ev.judge_id !== selectedJudge && ev.judge_code !== selectedJudge) {
        return false;
      }
      // Event type filter
      if (selectedEventType !== 'ALL' && ev.event_type !== selectedEventType) {
        return false;
      }
      // Participant filter
      if (selectedParticipant !== 'ALL' && ev.participant_id !== selectedParticipant && ev.participant_number !== selectedParticipant) {
        return false;
      }
      // Keyword search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesJudge = (ev.judge_name && ev.judge_name.toLowerCase().includes(q)) ||
                             (ev.judge_code && ev.judge_code.toLowerCase().includes(q));
        const matchesParticipant = (ev.participant_name && ev.participant_name.toLowerCase().includes(q)) ||
                                   (ev.participant_name_dhivehi && ev.participant_name_dhivehi.includes(q)) ||
                                   (ev.participant_number && ev.participant_number.includes(q));
        const matchesCriterion = (ev.criterion_name && ev.criterion_name.toLowerCase().includes(q)) ||
                                 (ev.criterion_name_dhivehi && ev.criterion_name_dhivehi.includes(q));
        const matchesReason = (ev.reason && ev.reason.toLowerCase().includes(q)) ||
                              (ev.notes && ev.notes.toLowerCase().includes(q));
        const matchesInstitution = (ev.institution && ev.institution.toLowerCase().includes(q)) ||
                                   (ev.island && ev.island.toLowerCase().includes(q));

        if (!matchesJudge && !matchesParticipant && !matchesCriterion && !matchesReason && !matchesInstitution) {
          return false;
        }
      }
      return true;
    });
  }, [events, selectedJudge, selectedEventType, selectedParticipant, searchQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredEvents.length) return;

    const headers = [
      'Timestamp',
      'Event Type',
      'Judge Code',
      'Judge Name',
      'Participant #',
      'Participant Name',
      'Participant Dhivehi Name',
      'Institution',
      'Island',
      'Criterion',
      'Deduction / Score Value',
      'Total Deductions',
      'Final Score',
      'Status',
      'Reason / Notes'
    ];

    const rows = filteredEvents.map((ev) => [
      `"${ev.created_at || ''}"`,
      `"${ev.event_type}"`,
      `"${ev.judge_code || ''}"`,
      `"${(ev.judge_name || '').replace(/"/g, '""')}"`,
      `"#${ev.participant_number || ''}"`,
      `"${(ev.participant_name || '').replace(/"/g, '""')}"`,
      `"${(ev.participant_name_dhivehi || '').replace(/"/g, '""')}"`,
      `"${(ev.institution || '').replace(/"/g, '""')}"`,
      `"${(ev.island || '').replace(/"/g, '""')}"`,
      `"${(ev.criterion_name || '').replace(/"/g, '""')}"`,
      ev.deduction_value !== undefined ? ev.deduction_value : '',
      ev.deductions_total !== undefined ? -ev.deductions_total : '',
      ev.final_total !== undefined ? ev.final_total : '',
      `"${ev.submission_status || ''}"`,
      `"${(ev.reason || ev.notes || '').replace(/"/g, '""')}"`
    ]);

    // UTF-8 BOM for Thaana character rendering in Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Score_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedJudge('ALL');
    setSelectedEventType('ALL');
    setSelectedParticipant('ALL');
  };

  const hasActiveFilters = searchQuery !== '' || selectedJudge !== 'ALL' || selectedEventType !== 'ALL' || selectedParticipant !== 'ALL';

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-6">
      {/* 1. Header & Summary Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-800 rounded-lg">
              <Scale size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-dhivehi">
                <span>މާކްސް އޮޑިޓް</span>
                <span className="text-slate-400 font-sans text-sm font-normal">/ Score Audit Trail</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive, transparent record of every deduction and scoring event across all judges and contestants.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchScoreAuditData(true)}
            disabled={refreshing}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-emerald-700' : ''} />
            <span>އަލުން ބަލާލަން / Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredEvents.length === 0}
            className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
          >
            <Download size={14} />
            <span>އެކްސްޕޯޓް CSV / Export Log</span>
          </button>
        </div>
      </div>

      {/* 2. Analytical Summary Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-xs text-slate-500 font-medium font-dhivehi">ޖުމްލަ އިވެންޓް</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold text-slate-800">{summary.total_events}</span>
              <span className="text-[10px] text-slate-400 uppercase font-sans">Events</span>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
            <p className="text-xs text-rose-700 font-medium font-dhivehi">އުނިކުރި މާކްސް</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold text-rose-800">
                {summary.total_deductions_points > 0 ? `-${summary.total_deductions_points.toFixed(1)}` : '0.0'}
              </span>
              <span className="text-[10px] text-rose-600 font-sans font-medium">
                ({summary.total_deductions_count} cuts)
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-xs text-emerald-800 font-medium font-dhivehi">ހުށަހެޅި މާކްސް</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold text-emerald-800">{summary.total_submissions}</span>
              <span className="text-[10px] text-emerald-600 font-sans uppercase">Submissions</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
            <p className="text-xs text-blue-700 font-medium font-dhivehi">ބައިވެރިވި ފަނޑިޔާރުން</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold text-blue-800">{summary.active_judges_count}</span>
              <span className="text-[10px] text-blue-600 font-sans uppercase">Judges</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 col-span-2 sm:col-span-1">
            <p className="text-xs text-amber-800 font-medium font-dhivehi">މާކްސްދެވުނު ބައިވެރިން</p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold text-amber-800">{summary.scored_participants_count}</span>
              <span className="text-[10px] text-amber-700 font-sans uppercase">Contestants</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Filter & Search Controls */}
      <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ހޯއްދަވާ (ފަނޑިޔާރު، ބައިވެރިޔާ، ނަމްބަރު، އުނިކުރި ސަބަބު)..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter: Judge */}
          <div className="w-full md:w-48">
            <select
              value={selectedJudge}
              onChange={(e) => setSelectedJudge(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
            >
              <option value="ALL">ހުރިހާ ފަނޑިޔާރުން / All Judges</option>
              {judges.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.judge_code}: {j.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter: Event Type */}
          <div className="w-full md:w-48">
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
            >
              <option value="ALL">ހުރިހާ އިވެންޓް / All Events</option>
              <option value="DEDUCTION">އުނިކުރުން / Deductions Only</option>
              <option value="SUBMIT_MARKS">ހުށަހެޅުން / Final Submissions</option>
              <option value="DRAFT_MARKS">ޑްރާފްޓް / Draft Marks</option>
              <option value="REOPEN_SCORE">އަލުން ހުޅުވުން / Reopened Marks</option>
            </select>
          </div>

          {/* Filter: Participant */}
          <div className="w-full md:w-56">
            <select
              value={selectedParticipant}
              onChange={(e) => setSelectedParticipant(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
            >
              <option value="ALL">ހުރިހާ ބައިވެރިން / All Contestants</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.participant_number} - {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
            >
              <X size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Active filter count note */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>
            ދައްކަނީ: <strong>{filteredEvents.length}</strong> އިވެންޓް (ޖުމްލަ {events.length} އިވެންޓްގެ ތެރެއިން)
          </span>
          {hasActiveFilters && (
            <span className="text-emerald-700 font-medium">
              Filters Active
            </span>
          )}
        </div>
      </div>

      {/* 4. Audit Trail Table */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw className="animate-spin text-emerald-700" size={24} />
          <span className="text-xs">މާކްސް އޮޑިޓް ލޮގް ލޯޑުވަނީ... / Loading Score Audit Trail...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <FileSpreadsheet className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm font-bold text-slate-700 font-dhivehi">އެއްވެސް މާކްސް އޮޑިޓް އިވެންޓެއް ނުފެނުނު</p>
          <p className="text-xs text-slate-400 mt-1">
            {hasActiveFilters
              ? 'ފިލްޓަރުތަކާ ދިމާވާ އެއްވެސް ލޮގެއް ނެތް. ފިލްޓަރު ރީސެޓް ކޮށްލައްވާ.'
              : 'ފަނޑިޔާރުން މާކްސް އުނިކޮށް ހުށަހެޅުމުން މިތަނުގައި އޮޑިޓް ތަފްޞީލު ފެންނާނެއެވެ.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 px-3 py-1.5 bg-emerald-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
            >
              <X size={12} />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">ވަގުތު / Timestamp</th>
                <th className="py-3 px-3.5 whitespace-nowrap">ފަނޑިޔާރު / Judge</th>
                <th className="py-3 px-3.5 whitespace-nowrap">ބައިވެރިޔާ / Participant</th>
                <th className="py-3 px-3.5 whitespace-nowrap">މިންގަނޑު / Criterion & Event</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">އުނިކުރި / Value</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-center">ޙާލަތު / Status</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">ތަފްޞީލު / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredEvents.map((ev) => {
                const isDeduction = ev.event_type === 'DEDUCTION';
                const isSubmission = ev.event_type === 'SUBMIT_MARKS';
                const isDraft = ev.event_type === 'DRAFT_MARKS';
                const isReopen = ev.event_type === 'REOPEN_SCORE';

                return (
                  <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Clock size={12} className="text-slate-400" />
                        <span>{ev.created_at}</span>
                      </div>
                    </td>

                    {/* Judge */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-bold font-mono">
                          {ev.judge_code || 'JUDGE'}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-800 text-xs">
                            {ev.judge_name}
                          </div>
                          {ev.judge_name_dhivehi && (
                            <div className="text-[10px] text-slate-500 font-dhivehi">
                              {ev.judge_name_dhivehi}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Participant */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-bold text-xs font-mono">
                          #{ev.participant_number || '---'}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900 font-dhivehi text-xs">
                            {ev.participant_name_dhivehi || ev.participant_name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {ev.participant_name} {ev.institution ? `• ${ev.institution}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Criterion & Event Detail */}
                    <td className="py-3 px-3.5 max-w-xs">
                      <div>
                        {isDeduction && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded font-medium text-[10px]">
                              ކުށް / Deduction
                            </span>
                            <span className="font-semibold text-slate-800 text-xs">
                              {ev.criterion_name}
                            </span>
                          </div>
                        )}

                        {isSubmission && (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium text-[10px]">
                              ހުށަހެޅުން / Final Marks
                            </span>
                            <span className="font-medium text-slate-800 text-xs">
                              {ev.criterion_name}
                            </span>
                          </div>
                        )}

                        {isDraft && (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium text-[10px]">
                              ޑްރާފްޓް / Draft
                            </span>
                            <span className="font-medium text-slate-600 text-xs">
                              {ev.criterion_name}
                            </span>
                          </div>
                        )}

                        {isReopen && (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-medium text-[10px]">
                              ހުޅުވާލުން / Reopened
                            </span>
                            <span className="font-medium text-amber-800 text-xs">
                              {ev.criterion_name}
                            </span>
                          </div>
                        )}

                        {/* Dhivehi title */}
                        {ev.criterion_name_dhivehi && (
                          <div className="text-[11px] text-slate-600 font-dhivehi mt-0.5">
                            {ev.criterion_name_dhivehi}
                          </div>
                        )}

                        {/* Reason / Notes quote if present */}
                        {(ev.reason || ev.notes) && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 max-w-sm truncate">
                            &ldquo;{ev.reason || ev.notes}&rdquo;
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Deduction / Score Value */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-right">
                      {isDeduction && (
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-bold font-mono text-xs">
                          {Number(ev.deduction_value) < 0 ? ev.deduction_value : `-${ev.deduction_value}`}
                        </div>
                      )}

                      {isSubmission && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-bold font-mono text-xs">
                            {ev.final_total?.toFixed(2)}
                          </span>
                          <div className="text-[10px] text-rose-600 font-mono mt-0.5">
                            Total cuts: -{ev.deductions_total?.toFixed(1) || '0'}
                          </div>
                        </div>
                      )}

                      {isDraft && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-xs">
                            {ev.final_total?.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {isReopen && (
                        <span className="text-slate-400 text-xs font-mono">---</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-center">
                      {ev.submission_status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                          <CheckCircle2 size={11} />
                          <span>SUBMITTED</span>
                        </span>
                      ) : ev.submission_status === 'REOPENED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                          <AlertCircle size={11} />
                          <span>REOPENED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">
                          <span>DRAFT</span>
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => setInspectEvent(ev)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <Eye size={12} />
                        <span>ބައްލަވާ / View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Detailed Inspection Modal */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-50 text-emerald-800 rounded-lg">
                  <FileText size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-dhivehi">
                    އޮޑިޓް އިވެންޓް ތަފްޞީލު
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans">
                    Scoring Audit Event Details
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Event ID</span>
                  <span className="font-mono text-slate-700 font-medium break-all">{inspectEvent.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Timestamp</span>
                  <span className="font-mono text-slate-800 font-bold">{inspectEvent.created_at}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase block">Judge / ފަނޑިޔާރު</span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {inspectEvent.judge_code}: {inspectEvent.judge_name}
                  </div>
                  {inspectEvent.judge_name_dhivehi && (
                    <div className="text-[11px] text-slate-500 font-dhivehi">
                      {inspectEvent.judge_name_dhivehi}
                    </div>
                  )}
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase block">Participant / ބައިވެރިޔާ</span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    #{inspectEvent.participant_number} - {inspectEvent.participant_name}
                  </div>
                  {inspectEvent.participant_name_dhivehi && (
                    <div className="text-[11px] text-slate-500 font-dhivehi">
                      {inspectEvent.participant_name_dhivehi}
                    </div>
                  )}
                  {inspectEvent.institution && (
                    <div className="text-[10px] text-slate-400">
                      {inspectEvent.institution} ({inspectEvent.island})
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Event Type:</span>
                  <span className="font-bold font-mono px-2 py-0.5 bg-slate-200 text-slate-800 rounded">
                    {inspectEvent.event_type}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Criterion:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {inspectEvent.criterion_name}
                  </span>
                </div>

                {inspectEvent.criterion_name_dhivehi && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-dhivehi">މިންގަނޑު:</span>
                    <span className="font-medium text-slate-800 font-dhivehi text-right">
                      {inspectEvent.criterion_name_dhivehi}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                  <span className="text-slate-500">Deduction / Score Delta:</span>
                  <span className="font-bold font-mono text-sm text-rose-700">
                    {inspectEvent.deduction_value}
                  </span>
                </div>

                {inspectEvent.final_total !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Final Total Recorded:</span>
                    <span className="font-bold font-mono text-sm text-emerald-800">
                      {inspectEvent.final_total} / {inspectEvent.subtotal || 100}
                    </span>
                  </div>
                )}

                {inspectEvent.submission_status && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Submission Status:</span>
                    <span className="font-semibold text-slate-700">
                      {inspectEvent.submission_status}
                    </span>
                  </div>
                )}
              </div>

              {(inspectEvent.reason || inspectEvent.notes) && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <span className="text-amber-800 font-semibold block text-[11px] mb-1 font-dhivehi">
                    ސަބަބު / ފަނޑިޔާރުގެ ނޯޓު (Judge Notes & Reason):
                  </span>
                  <p className="text-slate-700 text-xs italic">
                    &ldquo;{inspectEvent.reason || inspectEvent.notes}&rdquo;
                  </p>
                </div>
              )}

              {inspectEvent.performance_session_id && (
                <div className="text-[10px] text-slate-400 font-mono">
                  Session ID: {inspectEvent.performance_session_id}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectEvent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                ލައްޕާލައްވާ / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
