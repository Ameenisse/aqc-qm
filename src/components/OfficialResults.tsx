import React, { useState, useEffect } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Award,
  Medal,
  Download,
  Printer,
  CheckCheck,
  RefreshCw,
  Sparkles,
  Filter
} from 'lucide-react';

export const OfficialResults: React.FC = () => {
  const { user } = useCompetition();
  const [results, setResults] = useState<any[]>([]);
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const isResultOfficer = user?.role === 'RESULT_OFFICER' || user?.role === 'ADMIN';

  const loadResults = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/results/calculate');
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadResults();
  }, []);

  const triggerCelebration = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleVerifyResults = async () => {
    if (!confirm('Are you sure you want to officially verify and lock all scores for the competition?')) {
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/results/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officer_id: user?.id, notes: 'Verified by Result Officer' })
      });
      if (res.ok) {
        triggerCelebration();
        await loadResults();
      }
    } catch (e) {
      console.error(e);
    }
    setVerifying(false);
  };

  const filteredResults = results.filter((r) => {
    const matchGrade = selectedGrade === 'ALL' || r.grade_name === selectedGrade;
    const matchBranch = selectedBranch === 'ALL' || r.branch_name === selectedBranch;
    return matchGrade && matchBranch;
  });

  // Unique grades and branches for filter
  const grades = Array.from(new Set(results.map((r) => r.grade_name)));
  const branches = Array.from(new Set(results.map((r) => r.branch_name)));

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
              Official Leaderboard & Standings
            </span>
            <span className="text-xs text-slate-500 font-sans">Verified calculation engine</span>
          </div>
          <h1 className="text-2xl font-bold font-dhivehi text-slate-900 mt-1">
            ރަސްމީ ނަތީޖާ / Official Competition Results
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={triggerCelebration}
            className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
            title="Celebrate top scores"
          >
            <Sparkles size={16} />
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
          >
            <Printer size={14} />
            <span>Print Sheet</span>
          </button>

          <button
            onClick={loadResults}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Recalculate</span>
          </button>

          {isResultOfficer && (
            <button
              onClick={handleVerifyResults}
              disabled={verifying}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
            >
              <CheckCheck size={15} />
              <span>Verify & Publish</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-sans">
          <Filter size={14} />
          <span>Filter Standings:</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-dhivehi">ގުރޭޑް:</span>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
          >
            <option value="ALL">All Grades (ހުރިހާ ގުރޭޑް)</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-dhivehi">ގޮފި:</span>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
          >
            <option value="ALL">All Branches (ހުރިހާ ގޮފި)</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Standings Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50 text-slate-600 font-bold">
                <th className="py-3 px-3 text-center">ވަނަ</th>
                <th className="py-3 px-3">ނަންބަރު</th>
                <th className="py-3 px-3">ބައިވެރިޔާ</th>
                <th className="py-3 px-3">ގުރޭޑް / ގޮފި</th>
                <th className="py-3 px-3">ސްކޫލް / ރަށް</th>
                <th className="py-3 px-3 text-center">ފަނޑިޔާރުންގެ މާކްސް</th>
                <th className="py-3 px-3 text-center">އެވްރެޖް / ޖުމްލަ</th>
                <th className="py-3 px-3 text-center">ޙާލަތު</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResults.map((row, idx) => {
                const rank = row.rank || idx + 1;
                const isTop1 = rank === 1;
                const isTop2 = rank === 2;
                const isTop3 = rank === 3;

                return (
                  <tr
                    key={row.participant_id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isTop1
                        ? 'bg-amber-50/50 font-semibold'
                        : isTop2
                        ? 'bg-slate-50/70 font-semibold'
                        : isTop3
                        ? 'bg-orange-50/30'
                        : ''
                    }`}
                  >
                    <td className="py-3.5 px-3 text-center">
                      {isTop1 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-bold shadow-xs">
                          <Trophy size={14} />
                        </span>
                      ) : isTop2 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-bold shadow-xs">
                          2
                        </span>
                      ) : isTop3 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/60 text-white font-bold shadow-xs">
                          3
                        </span>
                      ) : (
                        <span className="font-mono text-slate-500 font-bold">{rank}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 font-mono font-bold text-slate-900">
                      #{row.participant_number}
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="font-bold text-slate-900 font-dhivehi text-sm">
                        {row.participant_name_dhivehi}
                      </div>
                      <div className="text-[11px] text-slate-500 font-sans">
                        {row.participant_name}
                      </div>
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="text-slate-800 font-dhivehi">{row.grade_name_dhivehi}</div>
                      <div className="text-[10px] text-emerald-800 font-semibold">
                        {row.branch_name_dhivehi}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-slate-600">
                      <div>{row.institution}</div>
                      <div className="text-[10px] text-slate-400">{row.island}</div>
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono text-[11px]">
                      {row.judge_breakdown ? (
                        <div className="flex items-center justify-center gap-1 text-slate-600">
                          {Object.entries(row.judge_breakdown).map(([jCode, sc]: any) => (
                            <span key={jCode} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                              {jCode}: {sc}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span className="font-mono font-bold text-base text-slate-900">
                        {row.final_score !== null ? row.final_score.toFixed(2) : '-'}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          row.status === 'VERIFIED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {row.status || 'PROVISIONAL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
