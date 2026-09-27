import React, { useState, useEffect } from 'react';
import { CompetitionProvider, useCompetition } from './context/CompetitionContext';
import { TopNav } from './components/TopNav';
import { BellBanner } from './components/BellBanner';
import { PresentationControl } from './components/PresentationControl';
import { PodiumDisplay } from './components/PodiumDisplay';
import { AudienceDisplay } from './components/AudienceDisplay';
import { JudgePanel } from './components/JudgePanel';
import { AdminPanel } from './components/AdminPanel';
import { OfficialResults } from './components/OfficialResults';
import { DigitalMushaf } from './components/DigitalMushaf';
import { LoginPage } from './components/LoginPage';
import { OfflineIndicator } from './components/OfflineIndicator';

type SystemType = 'operator' | 'podium' | 'audience' | 'judge' | 'admin' | 'public_results';

function MainAppShell() {
  const { user } = useCompetition();

  const [currentSystem, setCurrentSystem] = useState<SystemType>(() => {
    const params = new URLSearchParams(window.location.search);
    const sysParam = params.get('system') as SystemType;
    if (['operator', 'podium', 'audience', 'judge', 'admin', 'public_results'].includes(sysParam)) {
      return sysParam;
    }
    return 'operator';
  });

  const [showMushaf, setShowMushaf] = useState(false);

  // Sync and enforce designated page based on user role
  useEffect(() => {
    if (!user) return;

    if (user.role === 'PRESENTATION_OPERATOR') {
      setCurrentSystem('operator');
    } else if (user.role === 'JUDGE') {
      setCurrentSystem('judge');
    } else if (user.role === 'PODIUM') {
      setCurrentSystem('podium');
    } else if (user.role === 'AUDIENCE') {
      setCurrentSystem('audience');
    }
  }, [user?.role]);

  // 1. App starts on Login Page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  // 2. Role-specific view configurations
  // For Podium: no navigation button, no logout button, kiosk display
  // For Audience: audience screen URL removes all other page buttons, auto-hide logout button
  const isPodium = user.role === 'PODIUM' || (currentSystem === 'podium' && user.role !== 'ADMIN');
  const isAudience = user.role === 'AUDIENCE' || (currentSystem === 'audience' && user.role !== 'ADMIN');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-emerald-200">
      {/* Real-time Bell Banner (Only for operator, judge, admin) */}
      {!isPodium && !isAudience && <BellBanner />}

      {/* Top Application Header (Completely hidden for Podium and Audience screens) */}
      {!isPodium && !isAudience && (
        <TopNav
          currentSystem={currentSystem}
          setCurrentSystem={setCurrentSystem}
          onOpenMushaf={() => setShowMushaf(true)}
        />
      )}

      {/* If Admin is previewing Audience or Podium, show a small return button so admin doesn't get trapped */}
      {user.role === 'ADMIN' && (currentSystem === 'podium' || currentSystem === 'audience') && (
        <div className="fixed top-2 right-2 z-50">
          <button
            onClick={() => setCurrentSystem('admin')}
            className="px-3 py-1.5 bg-slate-900/85 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold backdrop-blur-xs border border-slate-700 shadow-md transition-all cursor-pointer"
          >
            ← Return to Admin Panel
          </button>
        </div>
      )}

      {/* Main Content Area strictly locked by user role */}
      <main className="flex-1">
        {user.role === 'PRESENTATION_OPERATOR' && <PresentationControl />}
        {user.role === 'JUDGE' && <JudgePanel />}
        {user.role === 'PODIUM' && <PodiumDisplay />}
        {user.role === 'AUDIENCE' && <AudienceDisplay />}

        {/* Admin and Result Officer roles can access all pages */}
        {(user.role === 'ADMIN' || user.role === 'RESULT_OFFICER') && (
          <>
            {currentSystem === 'operator' && <PresentationControl />}
            {currentSystem === 'podium' && <PodiumDisplay />}
            {currentSystem === 'audience' && <AudienceDisplay />}
            {currentSystem === 'judge' && <JudgePanel />}
            {currentSystem === 'admin' && <AdminPanel />}
            {currentSystem === 'public_results' && <OfficialResults />}
          </>
        )}
      </main>

      {/* Digital Mushaf Overlay */}
      {showMushaf && (
        <DigitalMushaf
          initialPage={1}
          onClose={() => setShowMushaf(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <CompetitionProvider>
      <MainAppShell />
      <OfflineIndicator />
    </CompetitionProvider>
  );
}
