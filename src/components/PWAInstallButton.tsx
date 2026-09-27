import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share2, PlusSquare, X, CheckCircle2 } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'hero' | 'minimal';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'nav', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 4000);
      }
    } else {
      // Show browser installation instructions (iOS Safari, Chrome, Edge)
      setShowGuide(true);
    }
  };

  if (installSuccess) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold shadow-xs">
        <CheckCircle2 size={14} />
        <span>އެޕް އިންސްޓޯލް ވެއްޖެ (Installed)</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        title="Install Ababil Quran Competition as an app on your phone, tablet, or PC"
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold text-xs transition-all shadow-xs active:scale-95 ${
          variant === 'hero'
            ? 'px-5 py-2.5 bg-linear-to-r from-blue-700 via-indigo-700 to-blue-800 text-white hover:from-blue-600 hover:to-indigo-600 shadow-blue-900/30'
            : variant === 'minimal'
            ? 'px-2.5 py-1.5 bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
            : 'px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white border border-blue-600'
        } ${className}`}
      >
        <Download size={14} className="animate-bounce" />
        <span className="font-dhivehi">އެޕް އަޅުއްވާ</span>
        <span className="opacity-75 font-sans font-medium text-[11px] hidden sm:inline">/ Install App</span>
      </button>

      {/* Installation Guide Modal (For iOS Safari or browsers where prompt requires manual step) */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <img src="/app-logo.png" alt="AQC Logo" className="w-9 h-9 rounded-xl shadow-xs border border-slate-200" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-dhivehi">
                    އެޕް އިންސްޓޯލް ކުރެއްވުން
                  </h3>
                  <p className="text-xs text-slate-500 font-sans">
                    Install Ababil Quran Competition App
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Guide Steps */}
            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-700 font-sans">
                <p className="font-semibold text-slate-900 font-dhivehi text-right text-sm">
                  އައިފޯން ނުވަތަ އައިޕެޑުގައި އެޕް އަޅުއްވަން:
                </p>
                <div className="flex items-start gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                    <Share2 size={16} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Step 1: Tap Share button</span>
                    <p className="text-slate-600 mt-0.5">
                      Safari ބްރައުޒަރުގެ ތިރީގައިވާ ނުވަތަ މަތީގައިވާ Share ބަޓަނަށް ފިއްތަވާލައްވާ.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0 mt-0.5">
                    <PlusSquare size={16} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Step 2: Add to Home Screen</span>
                    <p className="text-slate-600 mt-0.5">
                      ތިރިއަށް ޖައްސަވާލެއްވުމަށްފަހު <strong>'Add to Home Screen'</strong> (ނުވަތަ ހޯމް ސްކްރީނަށް އިތުރުކުރޭ) ޚިޔާރުކުރައްވާ.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-700 font-sans">
                <p className="font-semibold text-slate-900 font-dhivehi text-right text-sm">
                  ކޮމްޕިއުޓަރު، ޓެބްލެޓް ނުވަތަ އެންޑްރޮއިޑް ފޯނުގައި އަޅުއްވަން:
                </p>
                
                <div className="flex items-start gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">Android Chrome:</span>
                    <p className="text-slate-600 mt-0.5">
                      މަތީ ކަނުގައިވާ 3 ތިކި (Menu) އަށް ފިއްތަވާލެއްވުމަށްފަހު <strong>'Install app'</strong> ނުވަތަ <strong>'Add to Home screen'</strong> އަށް ފިއްތަވާލައްވާ.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="p-2 rounded-lg bg-slate-700 text-white shrink-0 mt-0.5">
                    <Download size={16} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">PC / Mac (Chrome, Edge):</span>
                    <p className="text-slate-600 mt-0.5">
                      URL ބާރުގެ ކަނާތްފަރާތުގައިވާ އިންސްޓޯލް އައިކަން (<Download size={11} className="inline mx-0.5" />) އަށް ފިއްތަވާލައްވާ ނުވަތަ Browser Menu އިން Install ޚިޔާރުކުރައްވާ.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => setShowGuide(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition"
              >
                ބަންދުކުރައްވާ / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
