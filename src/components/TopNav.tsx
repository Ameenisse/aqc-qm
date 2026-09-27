import React from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Sliders,
  Tv,
  Tablet,
  Award,
  Shield,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  ExternalLink,
  BookOpen,
  LogOut,
  Bell,
  User as UserIcon
} from 'lucide-react';

interface TopNavProps {
  currentSystem: 'operator' | 'podium' | 'audience' | 'judge' | 'admin' | 'public_results';
  setCurrentSystem: (sys: 'operator' | 'podium' | 'audience' | 'judge' | 'admin' | 'public_results') => void;
  onOpenMushaf?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ currentSystem, setCurrentSystem, onOpenMushaf }) => {
  const { user, connected, stageState, soundEnabled, setSoundEnabled, logout } = useCompetition();

  const systems = [
    { id: 'operator', label: 'ސްޓޭޖް ކޮންޓްރޯލް', sub: 'Operator', icon: Sliders },
    { id: 'podium', label: 'ޕޯޑިއަމް ސްކްރީން', sub: 'Podium', icon: Tablet },
    { id: 'audience', label: 'ޓީވީ / ޕްރޮޖެކްޓަރ', sub: 'Audience TV', icon: Tv },
    { id: 'judge', label: 'ފަނޑިޔާރުންގެ ޕެނަލް', sub: 'Judge Panel', icon: Award },
    { id: 'admin', label: 'މެނޭޖްމަންޓް', sub: 'Admin', icon: Shield },
    { id: 'public_results', label: 'ނަތީޖާ', sub: 'Official Results', icon: BookOpen }
  ] as const;

  // Podium role: completely hide TopNav (handled in App.tsx)
  if (user?.role === 'PODIUM') {
    return null;
  }

  // Audience role or screen: completely hide TopNav (handled in App.tsx)
  if (user?.role === 'AUDIENCE' || currentSystem === 'audience') {
    return null;
  }

  const isAdmin = user?.role === 'ADMIN';
  const isOperator = user?.role === 'PRESENTATION_OPERATOR';
  const isJudge = user?.role === 'JUDGE';
  const comp = stageState?.competition;
  const logoUrl = comp?.organization_logo_url || comp?.competition_logo_url || '/app-logo.png';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs text-slate-600">
          
          {/* Identity & Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <img
                src={`${logoUrl}?v=${comp?.updated_at || '1'}`}
                alt="Ababil Quran Competition Logo"
                className="w-8 h-8 rounded-lg object-contain shadow-xs border border-blue-900/10 shrink-0"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 animate-pulse shrink-0" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="font-bold text-slate-800 tracking-wide text-xs sm:text-sm font-dhivehi leading-tight">
                  {comp?.name_dhivehi || 'އަބާބީލް ޤުރުއާން މުބާރާތް 1446'}
                </span>
                <span className="text-slate-400 font-sans hidden sm:inline">|</span>
                <span className="text-slate-500 font-sans text-[11px] sm:text-xs font-semibold leading-tight">
                  {comp?.name || 'Ababil Quran Competition'}
                </span>
              </div>
            </div>

            {/* Stage Status badge */}
            {stageState && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 font-dhivehi">
                {stageState.stage_status === 'HOLDING' && 'ހިމޭން (Holding)'}
                {stageState.stage_status === 'CALLED' && 'ގޮވާލެވިއްޖެ (Called)'}
                {stageState.stage_status === 'QUESTION_SELECTION_ALLOWED' && 'ސުވާލު ނެގުން'}
                {stageState.stage_status === 'QUESTION_SELECTED' && 'ސުވާލު ނެގިއްޖެ'}
                {stageState.stage_status === 'PERFORMING' && 'ކިޔަވަނީ (Performing)'}
                {stageState.stage_status === 'PERFORMANCE_FINISHED' && 'ނިމުނީ (Finished)'}
              </span>
            )}
          </div>

          {/* User info & Utility Controls */}
          <div className="flex items-center gap-2.5">
            
            {/* Install PWA Button */}
            <PWAInstallButton variant="nav" />
            
            {/* Active User Badge */}
            {user && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                <UserIcon size={12} className="text-slate-500" />
                <span className="font-dhivehi font-bold text-xs text-slate-800">
                  {user.name_dhivehi || user.name}
                </span>
                {user.judge_code && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-mono text-[10px] font-bold">
                    {user.judge_code}
                  </span>
                )}
                {user.can_trigger_stage_bells && isJudge && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold" title="Designated Bell Judge">
                    <Bell size={10} />
                    <span>Bell</span>
                  </span>
                )}
                <span className="text-[10px] text-slate-500 hidden md:inline font-sans">
                  ({user.role === 'PRESENTATION_OPERATOR' ? 'Controller' : user.role})
                </span>
              </div>
            )}

            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Bell chime audio enabled' : 'Bell audio muted'}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-sans transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-500 border-slate-300'
              }`}
            >
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              <span className="hidden sm:inline">{soundEnabled ? 'Bell ON' : 'Muted'}</span>
            </button>

            {/* Real-time sync badge */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-sans font-medium border ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{connected ? 'Live Sync' : 'Offline'}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Logout from system"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 hover:text-rose-800 text-xs font-medium transition-colors cursor-pointer"
            >
              <LogOut size={12} />
              <span className="font-dhivehi text-xs">ފޭބުން</span>
              <span className="hidden md:inline font-sans text-[11px]">Logout</span>
            </button>
          </div>
        </div>

        {/* Systems Nav Bar */}
        <div className="flex items-center justify-between py-2 gap-2">
          
          {/* If ADMIN: show all system buttons.
              If OPERATOR or JUDGE: DO NOT show other page buttons! Show only their locked panel indicator. */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {systems.map((sys) => {
                const Icon = sys.icon;
                const isActive = currentSystem === sys.id;
                return (
                  <button
                    key={sys.id}
                    onClick={() => setCurrentSystem(sys.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={15} className={isActive ? 'text-amber-300' : 'text-slate-500'} />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-semibold font-dhivehi">{sys.label}</span>
                      <span className={`text-[10px] font-sans ${isActive ? 'text-emerald-200' : 'text-slate-400'}`}>
                        {sys.sub}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : isOperator ? (
            <div className="flex items-center gap-2 text-emerald-900 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <Sliders size={16} className="text-emerald-700" />
              <div className="flex items-baseline gap-2">
                <span className="font-bold font-dhivehi text-sm text-emerald-950">
                  ސްޓޭޖް އަދި ޕްރެޒެންޓޭޝަން ކޮންޓްރޯލް
                </span>
                <span className="text-xs text-emerald-700 font-sans">
                  (Presentation Controller Portal)
                </span>
              </div>
            </div>
          ) : isJudge ? (
            <div className="flex items-center gap-2 text-amber-900 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <Award size={16} className="text-amber-700" />
              <div className="flex items-baseline gap-2">
                <span className="font-bold font-dhivehi text-sm text-amber-950">
                  ފަނޑިޔާރުންގެ މާކްސް ޕެނަލް
                </span>
                <span className="text-xs text-amber-700 font-sans">
                  (Official Judges Scoring Panel)
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">
              Ababil Quran Competition Portal
            </div>
          )}

          {/* Right Action Utilities (Mushaf, Popout) */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenMushaf && (
              <button
                onClick={onOpenMushaf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors shadow-xs cursor-pointer"
              >
                <BookOpen size={14} className="text-amber-700" />
                <span className="font-dhivehi">މުޞްޙަފް</span>
                <span className="hidden md:inline font-sans">(Mushaf)</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => {
                  const url = window.location.origin + '?system=' + currentSystem;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                title="Open current system in dedicated standalone tab/window"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-sans transition-colors cursor-pointer"
              >
                <ExternalLink size={13} />
                <span className="hidden md:inline">Popout</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
