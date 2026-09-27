import React, { useState } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  KeyRound,
  ShieldCheck
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, stageState } = useCompetition();
  const comp = stageState?.competition;
  const logoUrl = comp?.organization_logo_url || comp?.competition_logo_url || '/app-logo.png';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setError('ޔޫޒަރނޭމް އަދި ޕިން ލިޔުއްވާ (Please enter both username and PIN)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('ސާވަރުން ޖަވާބު ލިބުމުގައި މައްސަލައެއް ދިމާވެއްޖެ (Invalid response from server)');
      }

      if (!res.ok) {
        throw new Error(data.error || 'ޔޫޒަރނޭމް ނުވަތަ ޕިން ރަނގަޅެއް ނޫން (Invalid username or PIN)');
      }

      if (!data.user) {
        throw new Error('ޔޫޒަރ ޑޭޓާ ލިބުމުގައި މައްސަލައެއް ދިމާވެއްޖެ (User data missing)');
      }

      login(data.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-emerald-950 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md mx-auto space-y-7">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="inline-block relative mb-1">
            <img
              src={`${logoUrl}?v=${comp?.updated_at || '1'}`}
              alt="Ababil Quran Competition Logo"
              className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-3xl object-contain shadow-2xl border-2 border-amber-400/40 ring-4 ring-emerald-500/20"
            />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide font-dhivehi leading-snug">
            {comp?.name_dhivehi || 'އަބާބީލް ޤުރުއާން މުބާރާތް 1446'}
          </h1>
          <p className="text-xs sm:text-sm text-emerald-200/90 font-medium">
            {comp?.name || 'Ababil Quran Competition Management System'}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400/80">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Official Stage, Judging & Live Display Portal</span>
          </div>

          {/* Quick PWA Install Callout */}
          <div className="pt-1 flex justify-center">
            <PWAInstallButton variant="hero" />
          </div>
        </div>

        {/* Main Login Card */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-emerald-800/40 shadow-2xl p-6 sm:p-8 space-y-6">
          
          <div className="border-b border-slate-800 pb-4 text-center">
            <h2 className="text-lg font-bold text-white font-dhivehi">
              ވަދެވަޑައިގަންނަވާ / System Login
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your assigned username and PIN to access your portal
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-950/80 border border-rose-600/60 rounded-xl flex items-center gap-3 text-rose-200 text-sm">
              <AlertCircle size={18} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                ޔޫޒަރނޭމް / Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon size={16} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username (e.g. admin)"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>

            {/* PIN / Password Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  ޕިން ކޯޑް / PIN
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter PIN (e.g. 602613)"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans tracking-wider"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:scale-98 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn size={16} />
                )}
                <span className="font-dhivehi font-bold">ވަދެވަޑައިގަންނަވާ</span>
                <span>/ Sign In</span>
              </button>
            </div>
          </form>

          {/* Admin Built-in PIN note */}
          <div className="p-3 bg-emerald-950/40 border border-emerald-700/30 rounded-xl text-center text-xs text-emerald-200/90 flex items-center justify-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
            <span>
              Admin user: <strong className="text-white font-mono">admin</strong> &bull; Built-in PIN: <strong className="text-amber-300 font-mono">602613</strong>
            </span>
          </div>

        </div>

        {/* Footer Note */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <p className="font-dhivehi">
            ޔޫޒަރުންނަށް ކަނޑައެޅިފައިވާ ޚާއްޞަ ޕޯޓަލްތަކަށް ވަދެވޭނީ ރަޖިސްޓަރީ ކުރެވިފައިވާ ޔޫޒަރނޭމް އަދި ޕިން އިންނެވެ
          </p>
          <p className="text-[11px] text-slate-600">
            For password / PIN reset, please contact the Competition Director (Admin Panel).
          </p>
        </div>

      </div>
    </div>
  );
};
