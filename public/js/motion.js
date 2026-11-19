// Récompenses visuelles après sauvegarde, sans modifier les règles de score.
import { confetti, animateCount } from './ui.js';

let rewardTimer;
export function initMotion() {
  const host = document.createElement('div');
  host.className = 'reward-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  document.body.appendChild(host);
  window.addEventListener('learning:reward', ({ detail: d }) => {
    clearTimeout(rewardTimer);
    const messages = [];
    if (d.xp > 0) messages.push(`+${d.xp} XP`);
    if (d.newDay) messages.push(`🔥 ${d.streak} jour${d.streak > 1 ? 's' : ''} de série`);
    if (d.levelUp) messages.push(`Niveau ${d.level} atteint !`);
    if (!messages.length) return;
    const badge = document.createElement('div');
    badge.className = 'reward-badge';
    const label = document.createElement('strong');
    label.textContent = messages.join(' · ');
    badge.appendChild(label);
    if (d.levelUp) {
      const note = document.createElement('span');
      note.textContent = 'Chaque mot compte. Continue !';
      badge.appendChild(note);
    }
    host.replaceChildren(badge);
    if (d.levelUp || (d.newDay && [7, 30, 100].includes(d.streak))) confetti({ count: 45 });
    document.querySelectorAll('[data-xp]').forEach(el => animateCount(el, d.todayXP));
    rewardTimer = setTimeout(() => host.replaceChildren(), 3200);
  });
  window.addEventListener('hashchange', () => {
    clearTimeout(rewardTimer);
    host.replaceChildren();
  });
}
