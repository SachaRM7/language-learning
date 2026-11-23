// Inventaire et référence Hafs de @tilawa/core/assets/ref-v2.json (Muaalem v3.2).
const tokens = 'ءبتثجحخدذرزسشصضطظعغفقكلمنهوياۦۥَُِ۪ـٲڇں۾ؙۜ';

export function decodePhonemes(logits) {
  const classes = tokens.length + 1;
  let previous = 0;
  let text = '';
  for (let frame = 0; frame < logits.length; frame += classes) {
    let best = 0;
    for (let i = 1; i < classes; i++) {
      if (logits[frame + i] > logits[frame + best]) best = i;
    }
    if (best && best !== previous) text += tokens[best - 1];
    previous = best;
  }
  return text;
}

// Le pilote demande de réciter 1:2 en entier et de s’arrêter sur le dernier mot.
// Ancrer les deux observations au verset évite de noter une prise partielle.
export function assessFatiha(text) {
  const verse = /^ءَل([حه])َمدُلِللَا+هِرَببِلعَا+لَمِ(ۦ*)ن$/u.exec(text);
  if (!verse) return 'Prise incertaine. Récite tout le verset et marque l’arrêt final.';
  const count = verse[2].length;
  const letter = verse[1] === 'ه'
    ? 'Dans الْحَمْدُ, le modèle a reconnu ه. La lettre attendue est ح.'
    : 'Dans الْحَمْدُ, le modèle a reconnu ح.';
  const madd = count < 2
    ? 'Madd final possiblement écourté'
    : [2, 4, 6].includes(count) ? 'Durée du madd final permise' : 'Durée du madd final incertaine';
  return `${letter} ${madd} dans الْعَالَمِينَ. Estimation du modèle · ${count} temps. À l’arrêt · 2, 4 ou 6 temps permis.`;
}
