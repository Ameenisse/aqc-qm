import { SURAHS_LIST, VERIFIED_PASSAGES } from '../../server/quranData';

export { SURAHS_LIST, VERIFIED_PASSAGES };

export async function fetchQuranPassage(surah: number, start: number, end: number): Promise<string> {
  const key = `${surah}:${start}-${end}`;
  if (VERIFIED_PASSAGES[key]) {
    return VERIFIED_PASSAGES[key];
  }

  try {
    const res = await fetch(`/api/quran/passage?surah=${surah}&start=${start}&end=${end}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.text_arabic) {
        return json.text_arabic;
      }
    }
  } catch (err) {
    // Offline fallback
  }

  const s = SURAHS_LIST.find(x => x.number === surah);
  return `سُورَةُ ${s?.name_arabic || ''} (الآيات ${start} - ${end})\nبِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n[نَصُّ التِّلَاوَةِ الْمُعْتَمَدَةِ مِنْ صَفْحَةِ ${s?.page_start || 1}]`;
}
