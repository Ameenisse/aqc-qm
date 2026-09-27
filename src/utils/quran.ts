// Quran text parsing, Bismillah separation, ayah numbering, and cross-surah passage formatting
// Based on Ababil Quran Competition official specifications

export interface ParsedBismillah {
  bismillah: string;
  text: string;
}

/**
 * Arabic diacritics, Quranic waqf marks, and decorative characters:
 * - \u0610-\u061A (Honorifics and Quranic additions)
 * - \u064B-\u065F (Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun, etc.)
 * - \u0670 (Superscript Alef / Alif Khanjareeya)
 * - \u06D6-\u06ED (Quranic pause/waqf marks, sajda, rub-el-hizb, etc.)
 * - \u0640 (Tatweel / Kashida)
 */
export const isQuranicMark = (ch: string): boolean =>
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/.test(ch);

/**
 * Converts Western digits (0-9) to Eastern Arabic-Indic numerals (٠-٩).
 */
export function toArabicNumerals(num: number | string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(num).replace(/\d/g, (d) => arabicDigits[parseInt(d, 10)] || d);
}

/**
 * Detects Bismillah at the beginning of an Arabic passage while ignoring
 * Arabic vowel diacritics and Quranic marks, while preserving the exact original characters
 * and retaining any combining diacritics on the final letter of Bismillah.
 */
export function separateExistingBismillah(text: string): ParsedBismillah {
  text = String(text || '').trim();
  if (!text) return { bismillah: '', text: '' };

  let normalized = '';
  const sourceIndex: number[] = [];

  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (isQuranicMark(ch)) continue;
    if (/[ٱأإآ]/.test(ch)) ch = 'ا';

    if (/\s/.test(ch)) {
      if (!normalized || normalized.endsWith(' ')) continue;
      normalized += ' ';
      sourceIndex.push(i);
      continue;
    }

    normalized += ch;
    sourceIndex.push(i);
  }

  const target = 'بسم الله الرحمن الرحيم';
  if (!normalized.startsWith(target)) return { bismillah: '', text };

  const lastNormalizedIndex = target.length - 1;
  let originalEnd = (sourceIndex[lastNormalizedIndex] ?? -1) + 1;
  if (originalEnd <= 0) return { bismillah: '', text };

  // Crucial: Include any trailing combining marks on the last letter (e.g. kasrah on meem in الرحيمِ)
  while (originalEnd < text.length && isQuranicMark(text[originalEnd])) {
    originalEnd++;
  }

  let bismillah = text.slice(0, originalEnd).trim();
  let rest = text.slice(originalEnd).trim();

  // In Al-Fatiha, if the verse 1 marker belongs to Bismillah, keep it on the Bismillah line.
  const ayahOne = rest.match(/^[﴿\(\[\{]\s*([١1])\s*[﴾\)\]\}]/);
  if (ayahOne) {
    bismillah += ' ' + ayahOne[0];
    rest = rest.slice(ayahOne[0].length).trim();
  }

  return { bismillah, text: rest };
}

const escapeHtml = (v: any) =>
  String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));

/**
 * Normalizes ayah numbers with ornate Quranic brackets ﴿...﴾ and Arabic numerals.
 */
function formatAyahMarkersInHtml(html: string): string {
  // Matches ornate brackets ﴿...﴾ or standard brackets (...) containing digits or Arabic numbers
  return html.replace(/(?:﴿|\()([\d\u0660-\u0669\s]+)(?:﴾|\))/g, (_, num) => {
    const cleanNum = num.trim();
    const arabicNum = toArabicNumerals(cleanNum);
    return ` <span class="quran-ayah-marker" dir="rtl">&#xFD3F;${arabicNum}&#xFD3E;</span> `;
  });
}

/**
 * Formats a Quran passage with:
 * - Proper RTL and Arabic joining (no broken or reversed glyphs)
 * - Complete diacritics and Quranic marks preserved
 * - Large readable Amiri Quran text typography
 * - Correct ayah numbering in ornate Quranic marks
 * - Full cross-surah passage support:
 *   * Each new surah starts on a separate paragraph
 *   * Beautiful decorative Surah dividers between cross-surah sections
 *   * Bismillah appears on its own centered line where applicable
 *   * Zero duplicate Bismillah, zero omitted verse text
 * - Identical formatting across audience, podium, and judge screens
 */
export function renderQuranPassage(text: string): string {
  text = String(text || '').trim();
  if (!text) return '';

  // 1. Normalize legacy markers
  text = text.replace(/\[\[ABABEEL_BISMILLAH\]\]/g, '[[ABABEEL_SURAH_DIVIDER]]');

  // 2. Auto-detect when Bismillah appears mid-text (e.g. after an ayah marker or newline)
  // This gracefully handles cross-surah passages pasted without explicit divider markers.
  text = text.replace(
    /([﴾\d\s])\s*(بِسْمِ\s+(?:اللَّهِ|ٱللَّهِ)\s+(?:الرَّحْمَٰنِ|ٱلرَّحْمَٰنِ)\s+(?:الرَّحِيمِ|ٱلرَّحِيمِ))/g,
    '$1[[ABABEEL_SURAH_DIVIDER]]$2'
  );

  // 3. Split cross-surah sections by divider marker, horizontal rules, or double newlines
  const rawSections = text
    .split(/(?:\[\[ABABEEL_SURAH_DIVIDER\]\]|\n\s*---\s*\n|\n\s*\n+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  let html = '';

  rawSections.forEach((section, index) => {
    // Cross-surah divider
    if (index > 0) {
      html += '<div class="quran-surah-divider" role="separator" aria-label="فاصل السورة"><span></span></div>';
    }

    // Check if section starts with a Surah header like "سُورَةُ ..." or "سورة ..."
    let surahTitle = '';
    const titleMatch = section.match(/^(?:سُورَةُ|سورة)\s+([^\n\r]+)/);
    if (titleMatch) {
      surahTitle = titleMatch[0].trim();
      section = section.slice(titleMatch[0].length).trim();
    }

    // If surah header exists, render a dignified Surah Title banner
    if (surahTitle) {
      html += `<div class="quran-surah-title">${escapeHtml(surahTitle)}</div>`;
    }

    const parsed = separateExistingBismillah(section);

    // Bismillah is always rendered on its own centered line where applicable
    if (parsed.bismillah) {
      const bismillahHtml = formatAyahMarkersInHtml(escapeHtml(parsed.bismillah));
      html += `<div class="quran-bismillah-line" dir="rtl">${bismillahHtml}</div>`;
    }

    // The Surah text (including its first Ayah) begins on a clean separate paragraph
    if (parsed.text) {
      const textHtml = formatAyahMarkersInHtml(escapeHtml(parsed.text));
      html += `<div class="quran-surah-section" dir="rtl">${textHtml}</div>`;
    }
  });

  return html;
}

export function formatQuestionRange(q: {
  surah_name?: string;
  start_surah_name?: string;
  end_surah_name?: string;
  start_surah_no?: number;
  end_surah_no?: number;
  start_ayah?: number;
  end_ayah?: number;
  start_page?: number;
  end_page?: number;
}): string {
  if (!q) return '';
  const startName = q.start_surah_name || q.surah_name || '';
  const endName = q.end_surah_name || q.surah_name || startName;
  const isSame =
    q.start_surah_no && q.end_surah_no
      ? q.start_surah_no === q.end_surah_no
      : startName === endName;

  const startAyah = q.start_ayah || 1;
  const endAyah = q.end_ayah || '';

  if (isSame) {
    return `${startName} (${startAyah} - ${endAyah})`;
  }
  // Cross-surah range formatted with proper RTL directionality
  return `${startName} (${startAyah}) ← ${endName} (${endAyah})`;
}
