// js/root-search.js — Recherche de racines : en arabe (1 à 3 lettres, séparées ou non, ou un mot entier)
// et en lettres latines (sens, translittération). Fonctions pures, testées dans tests/roots-search.test.mjs.

// Voyelles, signes coraniques et tatwil
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ARABIC = /[؀-ۿ]/;

/** Forme de comparaison : sans voyelles, hamza et alif unifiés (أ إ آ ٱ ء ؤ ئ → ا), ى → ي, ة → ه. */
export function normAr(s) {
  return String(s || '')
    .replace(MARKS, '')
    .replace(/[ٱأإآءؤئ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** Lettres arabes seules (les espaces, tirets et virgules entre les lettres sont ignorés). */
export function arabicLetters(s) {
  return normAr(s).replace(/[^ء-ي]/g, '');
}

export function normLatin(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[ʿʾ'’‘`]/g, '');
}

export const isArabicQuery = q => ARABIC.test(q);

/** a est-il une sous-suite de b (lettres dans l'ordre, pas forcément voisines) ? */
function isSubsequence(a, b) {
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
}

/** Plus petite fenêtre de b qui contient les lettres de a dans l'ordre. */
function matchSpan(a, b) {
  let best = Infinity;
  for (let start = 0; start < b.length; start++) {
    if (b[start] !== a[0]) continue;
    let i = 0, j = start;
    for (; j < b.length && i < a.length; j++) if (b[j] === a[i]) i++;
    if (i === a.length) best = Math.min(best, j - start);
  }
  return best;
}

// Translittération simple des lettres d'une racine (« كتب » → « k-t-b »)
const LATIN = {
  'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r',
  'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': '', 'غ': 'gh', 'ف': 'f',
  'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
};
export function rootTranslit(root) {
  return [...arabicLetters(root)].map(c => LATIN[c] ?? '').filter(Boolean).join('-');
}

/**
 * Pertinence d'une racine pour une recherche (0 = ne correspond pas).
 * @param {{root:string, words?:string[], latin?:string}} item
 *   root : lettres de la racine ; words : mots de la famille (arabe) ; latin : sens, translittération
 * @param {string} query
 */
export function scoreRoot(item, query) {
  const q = String(query || '').trim();
  if (!q) return 1;
  if (isArabicQuery(q)) {
    const Q = arabicLetters(q);
    if (!Q) return 0;
    const R = arabicLetters(item.root);
    if (R === Q) return 100;                                     // la racine exacte
    if (R.startsWith(Q)) return 80;                              // ses premières lettres
    if (isSubsequence(Q, R)) return 60;                          // 1 ou 2 de ses lettres, dans l'ordre
    const words = (item.words || []).map(arabicLetters);
    if (Q.length >= 2 && words.some(w => w.includes(Q))) return 40;   // un mot de la famille
    if (Q.length >= 4 && R.length >= 3 && isSubsequence(R, Q)) {
      // un mot conjugué/accordé : la racine dont les lettres sont les plus rapprochées l'emporte
      return Math.max(10, 30 - (matchSpan(R, Q) - R.length) * 2);
    }
    return 0;
  }
  const L = normLatin(q);
  const hay = normLatin(item.latin);
  if (hay.includes(L)) return 50;
  // « ktb » ou « k t b » pour la translittération « k-t-b »
  const compact = L.replace(/[\s-]/g, '');
  return compact.length >= 2 && hay.replace(/[\s-]/g, '').includes(compact) ? 45 : 0;
}
