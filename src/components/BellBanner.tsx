import React from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { Bell, AlertTriangle, XOctagon } from 'lucide-react';

export const BellBanner: React.FC = () => {
  const { activeBell } = useCompetition();

  if (!activeBell) return null;

  const isFirst = activeBell.bell_type === 'FIRST_WARNING';
  const isFinal = activeBell.bell_type === 'FINAL_WARNING';
  const isStop = activeBell.bell_type === 'STOP';

  let bgColor = 'bg-amber-500 border-amber-600 text-white';
  let title = 'ފުރަތަމަ އިންޒާރު / First Warning';
  let Icon = Bell;

  if (isFinal) {
    bgColor = 'bg-orange-500 border-orange-600 text-white';
    title = 'ދެވަނަ އިންޒާރު / Final Warning';
    Icon = AlertTriangle;
  } else if (isStop) {
    bgColor = 'bg-rose-600 border-rose-700 text-white';
    title = 'ހުއްޓާލާ / STOP RECITATION';
    Icon = XOctagon;
  }

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce duration-300 pointer-events-none">
      <div
        className={`flex items-center gap-3 px-6 py-3 rounded-xl border-2 shadow-xl ${bgColor} transition-all`}
      >
        <Icon size={24} className="animate-spin duration-700" />
        <div className="flex flex-col text-right">
          <span className="text-base font-bold tracking-wide">{title}</span>
          <span className="text-xs text-white/90 font-sans">
            Triggered by: {activeBell.judge_name || 'Designated Bell Officer'}
          </span>
        </div>
      </div>
    </div>
  );
};
