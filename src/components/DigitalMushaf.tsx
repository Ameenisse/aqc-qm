import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  Minimize,
  X,
  Search
} from 'lucide-react';
import { SURAHS_LIST, fetchQuranPassage } from '../data/quranClient';

interface DigitalMushafProps {
  initialPage?: number;
  initialSurah?: number;
  initialAyah?: number;
  onClose?: () => void;
  standalone?: boolean;
}

export const DigitalMushaf: React.FC<DigitalMushafProps> = ({
  initialPage = 1,
  initialSurah = 1,
  initialAyah = 1,
  onClose,
  standalone = false
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [jumpPageInput, setJumpPageInput] = useState<string>(String(initialPage));
  const [pageText, setPageText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Sync if initialPage changes externally (e.g. question selected on stage)
  useEffect(() => {
    if (initialPage && initialPage >= 1 && initialPage <= 604) {
      setCurrentPage(initialPage);
      setJumpPageInput(String(initialPage));
    }
  }, [initialPage]);

  // Find Surah and Juz corresponding to currentPage
  const currentSurahMeta = SURAHS_LIST.slice().reverse().find(s => s.page_start <= currentPage) || SURAHS_LIST[0];

  useEffect(() => {
    let isCancelled = false;
    const loadPassage = async () => {
      setLoading(true);
      try {
        const text = await fetchQuranPassage(currentSurahMeta.number, 1, Math.min(currentSurahMeta.ayah_count, 20));
        if (!isCancelled) {
          setPageText(text);
        }
      } catch (err) {
        if (!isCancelled) {
          setPageText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n[نَصُّ التِّلَاوَةِ الْمُعْتَمَدَةِ]');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadPassage();
    return () => {
      isCancelled = true;
    };
  }, [currentPage, currentSurahMeta.number, currentSurahMeta.ayah_count]);

  const handleNextPage = () => {
    if (currentPage < 604) {
      const next = currentPage + 1;
      setCurrentPage(next);
      setJumpPageInput(String(next));
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prev = currentPage - 1;
      setCurrentPage(prev);
      setJumpPageInput(String(prev));
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= 604) {
      setCurrentPage(p);
    } else {
      setJumpPageInput(String(currentPage));
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      className={`bg-slate-900 text-slate-100 flex flex-col z-50 overflow-hidden ${
        standalone ? 'w-full h-full min-h-screen' : 'fixed inset-4 rounded-2xl shadow-2xl border border-slate-700'
      }`}
    >
      {/* Top Controls Bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <BookOpen size={20} />
            <span className="font-bold text-sm">މުޞްޙަފް ރަފީޤް / Digital Mushaf</span>
          </div>
          <span className="text-slate-500">|</span>
          <div className="text-xs flex items-center gap-2 text-slate-300">
            <span className="font-arabic text-amber-300 font-bold text-sm">
              سُورَةُ {currentSurahMeta.name_arabic}
            </span>
            <span className="text-slate-400">({currentSurahMeta.name_english})</span>
            <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-[11px]">
              جُزْء {currentSurahMeta.juz_start}
            </span>
          </div>
        </div>

        {/* Page Jump & Navigation */}
        <div className="flex items-center gap-2">
          {/* Previous in Arabic/RTL corresponds to forward page or left/right buttons */}
          <button
            onClick={handleNextPage}
            disabled={currentPage >= 604}
            title="Next Page (الصفحة التالية)"
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={18} />
          </button>

          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
            <span className="text-xs text-slate-400">ޞަފްޙާ:</span>
            <input
              type="number"
              min={1}
              max={604}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              className="w-16 px-2 py-1 text-center text-xs bg-slate-950 border border-slate-700 rounded text-amber-300 font-bold focus:outline-none focus:border-amber-400"
            />
            <span className="text-xs text-slate-400">/ 604</span>
            <button
              type="submit"
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition-colors"
            >
              ދޭ
            </button>
          </form>

          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            title="Previous Page (الصفحة السابقة)"
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((z) => Math.min(160, z + 15))}
            title="Zoom In"
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoom(100)}
            title="Reset Zoom"
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs transition-colors"
          >
            {zoom}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(75, z - 15))}
            title="Zoom Out"
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            <ZoomOut size={16} />
          </button>

          <button
            onClick={toggleFullscreen}
            title="Fullscreen"
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Close Mushaf"
              className="p-1.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 transition-colors ml-2"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Mushaf Page Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center bg-radial from-slate-900 via-slate-950 to-black">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-150 w-full max-w-3xl bg-[#fdfbf7] text-slate-900 rounded-xl shadow-2xl p-6 md:p-10 border-4 border-[#e2d5bd] relative"
        >
          {/* Madinah Mushaf Frame Header */}
          <div className="flex items-center justify-between border-b-2 border-[#d4af37] pb-3 mb-6 text-sm text-[#5c4015] font-semibold">
            <span className="font-arabic text-base">جُزْءُ {currentSurahMeta.juz_start}</span>
            <span className="font-arabic text-xl text-[#0d5236] font-bold">
              سُورَةُ {currentSurahMeta.name_arabic}
            </span>
            <span className="font-sans font-bold">Page {currentPage}</span>
          </div>

          {/* Surah Banner if page is beginning of surah */}
          <div className="my-4 py-2 px-4 rounded-lg bg-[#f4ece1] border border-[#d4af37] text-center shadow-xs">
            <h3 className="font-arabic text-2xl md:text-3xl text-[#0d5236] font-bold">
              سُورَةُ {currentSurahMeta.name_arabic}
            </h3>
            <p className="text-xs text-amber-900 font-sans mt-0.5">
              {currentSurahMeta.name_english} • {currentSurahMeta.revelation_type} • {currentSurahMeta.ayah_count} Ayahs
            </p>
          </div>

          {/* Uthmanic Arabic Quran Passage */}
          <div className="my-6 p-4 rounded-lg bg-white/60 border border-amber-100 min-h-[360px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">ކިޔަވަނީ / Loading Ayahs...</span>
              </div>
            ) : (
              <p className="font-quran text-2xl md:text-3xl lg:text-4xl text-slate-900 leading-[2.6] text-center tracking-wide selection:bg-amber-200">
                {pageText}
              </p>
            )}
          </div>

          {/* Madinah Mushaf Frame Footer */}
          <div className="flex items-center justify-between border-t border-[#d4af37] pt-3 text-xs text-[#5c4015] font-bold">
            <span>مُصْحَفُ الْمَدِينَةِ النَّبَوِيَّةِ</span>
            <span className="w-8 h-8 rounded-full border border-[#d4af37] flex items-center justify-center font-bold bg-[#f4ece1] text-amber-900">
              {currentPage}
            </span>
            <span>حَفْصٌ عَنْ عَاصِمٍ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
