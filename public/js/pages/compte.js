// js/pages/compte.js — Comptes : connexion, inscription sur invitation, mot de passe, administration
// (invitations, utilisateurs, mot de passe provisoire). Le serveur : worker/accounts.js.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { toast, haptic } from '../ui.js';
import { showModal, hideModal, showConfirmModal } from '../components/modal.js';
import { accountReady, logout } from '../sync.js';

const $app = () => document.getElementById('app');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const err = new Error(data.message || (res.status === 404 ? 'Service indisponible en mode local.' : 'Une erreur est survenue. Réessaie.'));
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

/** Recharge l'app : la synchro redémarre avec le bon compte. */
function restart(path = '/home') {
  location.hash = `#${path}`;
  location.reload();
}

function field({ id, label, type = 'text', value = '', autocomplete = '', hint = '', attrs = '' }) {
  return `
    <label class="acc-field" for="${id}">
      <span class="acc-field__label">${escapeHtml(label)}</span>
      <span class="acc-field__box">
        <input id="${id}" name="${id}" type="${type}" value="${escapeHtml(value)}" autocomplete="${autocomplete}" ${attrs}>
        ${type === 'password' ? `<button type="button" class="acc-field__eye" data-eye="${id}" aria-label="Afficher le mot de passe">${icon('eye')}</button>` : ''}
      </span>
      ${hint ? `<span class="acc-field__hint">${escapeHtml(hint)}</span>` : ''}
    </label>`;
}

function bindEyes(root) {
  root.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.eye);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eye-off' : 'eye');
  }));
}

function setBusy(form, busy) {
  form.querySelectorAll('button, input').forEach(el => { el.disabled = busy; });
  form.classList.toggle('is-busy', busy);
}

function showError(form, message) {
  const el = form.querySelector('.acc-error');
  el.textContent = message;
  el.hidden = !message;
  if (message) { el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in'); haptic([30, 40, 30]); }
}

// ═════════ Connexion / inscription ═════════

export async function renderCompte(params = {}) {
  const me = store.get('account') ?? await Promise.race([accountReady, new Promise(r => setTimeout(() => r(null), 5000))]);
  if (me?.via === 'session') { navigate('/profil'); return; }

  const code = params.code ? decodeURIComponent(params.code).toUpperCase() : '';
  // Ancienne connexion Cloudflare Access : on propose de créer le mot de passe de ce compte
  const bootstrap = me?.via === 'access' && !me.account;
  const mode = code || bootstrap ? 'register' : 'login';
  render(mode, { code, me, bootstrap });
}

function render(mode, ctx) {
  const { code, me, bootstrap } = ctx;
  const register = mode === 'register';
  $app().innerHTML = `
    ${renderHeader({ title: 'Compte', back: '/profil' })}
    <main class="page-content acc">
      <section class="acc-hero">
        <div class="acc-hero__logo" lang="ar">أ</div>
        <h1 class="acc-hero__title">${register ? (bootstrap ? 'Crée ton mot de passe' : 'Créer un compte') : 'Se connecter'}</h1>
        <p class="acc-hero__sub">${register
          ? (bootstrap
            ? 'Ta progression actuelle est rattachée à cette adresse. Choisis un mot de passe pour te connecter sans Cloudflare.'
            : 'HelloArabic est sur invitation : il te faut le code que l’on t’a transmis.')
          : 'Retrouve ta progression sur tous tes appareils.'}</p>
      </section>

      ${bootstrap ? '' : `
        <div class="segmented acc-tabs" role="tablist">
          <button class="${register ? '' : 'is-active'}" data-mode="login" role="tab">Connexion</button>
          <button class="${register ? 'is-active' : ''}" data-mode="register" role="tab">Créer un compte</button>
        </div>`}

      <form class="acc-form card" id="acc-form" novalidate>
        ${register && !bootstrap ? field({ id: 'acc-invite', label: 'Code d’invitation', value: code, autocomplete: 'off', attrs: 'autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH"' }) : ''}
        ${field({ id: 'acc-email', label: 'Adresse e-mail', type: 'email', value: bootstrap ? me.email : '', autocomplete: 'email', attrs: `inputmode="email" required ${bootstrap ? 'readonly' : ''}` })}
        ${field({ id: 'acc-password', label: 'Mot de passe', type: 'password', autocomplete: register ? 'new-password' : 'current-password', hint: register ? 'Au moins 8 caractères.' : '', attrs: 'required minlength="8"' })}
        <p class="acc-error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block btn--lg" type="submit">${register ? 'Créer mon compte' : 'Se connecter'} ${icon('arrow-right')}</button>
        ${register ? '' : '<p class="acc-note">Mot de passe oublié ? Demande à l’administrateur un mot de passe provisoire.</p>'}
      </form>

      <p class="acc-local">${icon('monitor')} Sans compte, l’app reste utilisable : ta progression est gardée sur cet appareil et te suivra quand tu te connecteras.</p>
    </main>`;

  bindEyes($app());
  $app().querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { haptic(); render(b.dataset.mode, ctx); }));
  const form = document.getElementById('acc-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.querySelector('#acc-email').value.trim();
    const password = form.querySelector('#acc-password').value;
    const invite = form.querySelector('#acc-invite')?.value.trim();
    if (!email || !password) { showError(form, 'Renseigne ton e-mail et ton mot de passe.'); return; }
    if (register && password.length < 8) { showError(form, 'Le mot de passe doit contenir au moins 8 caractères.'); return; }
    showError(form, '');
    setBusy(form, true);
    try {
      const res = await api(register ? 'auth/register' : 'auth/login', { method: 'POST', body: { email, password, invite } });
      toast(register ? 'Compte créé, bienvenue !' : 'Connecté', { icon: 'check-circle' });
      setTimeout(() => restart(res.mustChange ? '/compte/mot-de-passe' : '/home'), 500);
    } catch (err) {
      setBusy(form, false);
      showError(form, err.message);
    }
  });
  if (!bootstrap) form.querySelector(register && !code ? '#acc-invite' : '#acc-email')?.focus({ preventScroll: true });
}

// ═════════ Mot de passe ═════════

export async function renderPassword() {
  const me = store.get('account') ?? await accountReady;
  if (me?.via !== 'session') { navigate('/compte'); return; }
  $app().innerHTML = `
    ${renderHeader({ title: 'Mot de passe', back: '/profil' })}
    <main class="page-content acc">
      ${me.mustChange ? `<div class="acc-banner">${icon('info')} Tu t’es connecté avec un mot de passe provisoire : choisis-en un nouveau.</div>` : ''}
      <form class="acc-form card" id="acc-form" novalidate>
        ${field({ id: 'acc-current', label: me.mustChange ? 'Mot de passe provisoire' : 'Mot de passe actuel', type: 'password', autocomplete: 'current-password', attrs: 'required' })}
        ${field({ id: 'acc-next', label: 'Nouveau mot de passe', type: 'password', autocomplete: 'new-password', hint: 'Au moins 8 caractères. Tes autres appareils seront déconnectés.', attrs: 'required minlength="8"' })}
        <p class="acc-error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block btn--lg" type="submit">Enregistrer</button>
      </form>
    </main>`;
  bindEyes($app());
  const form = document.getElementById('acc-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const current = form.querySelector('#acc-current').value;
    const next = form.querySelector('#acc-next').value;
    if (next.length < 8) { showError(form, 'Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    showError(form, '');
    setBusy(form, true);
    try {
      await api('auth/password', { method: 'POST', body: { current, next } });
      store.set('account', { ...me, mustChange: false });
      toast('Mot de passe modifié', { icon: 'check-circle' });
      navigate('/profil');
    } catch (err) {
      setBusy(form, false);
      showError(form, err.message);
    }
  });
}

// ═════════ Déconnexion ═════════

export function confirmLogout() {
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title">Se déconnecter ?</span>
          <button class="modal__close" id="modal-close" aria-label="Fermer">${icon('x')}</button>
        </div>
        <p class="confirm-modal__message">Ta progression est enregistrée dans ton compte. Sur un appareil partagé, efface-la de cet appareil.</p>
        <div class="btn-stack">
          <button class="btn btn--primary btn--block" id="lo-keep">Me déconnecter</button>
          <button class="btn btn--danger btn--block" id="lo-wipe">Me déconnecter et effacer cet appareil</button>
          <button class="btn btn--ghost btn--block" id="lo-cancel">Annuler</button>
        </div>
      </div>
    </div>`);
  const go = async wipe => {
    document.querySelectorAll('#modal-overlay button').forEach(b => { b.disabled = true; });
    await logout({ wipe });
    hideModal();
    toast('Déconnecté', { icon: 'check-circle' });
    setTimeout(() => restart('/home'), 300);
  };
  document.getElementById('lo-keep').addEventListener('click', () => go(false));
  document.getElementById('lo-wipe').addEventListener('click', () => go(true));
  document.getElementById('lo-cancel').addEventListener('click', hideModal);
  document.getElementById('modal-close').addEventListener('click', hideModal);
}

// ═════════ Administration ═════════

let A = null;

export async function renderAdmin() {
  const me = store.get('account') ?? await accountReady;
  if (!me?.admin) { navigate('/profil'); return; }
  A = { invites: [], users: [], error: null };
  try {
    const [inv, us] = await Promise.all([api('admin/invites'), api('admin/users')]);
    A.invites = inv.invites; A.users = us.users;
  } catch (err) { A.error = err.message; }
  renderAdminPage();
}

const fmtDate = t => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const inviteLink = code => `${location.origin}${location.pathname}#/compte/invitation/${code}`;

function inviteState(i) {
  if (i.revoked) return { label: 'révoquée', cls: '' };
  if (i.uses >= i.max_uses) return { label: 'utilisée', cls: 'badge--primary' };
  if (i.expires_at && i.expires_at < Date.now()) return { label: 'expirée', cls: '' };
  return { label: `active · ${i.max_uses - i.uses} place${i.max_uses - i.uses > 1 ? 's' : ''}`, cls: 'badge--gold' };
}

function renderAdminPage() {
  $app().innerHTML = `
    ${renderHeader({ title: 'Invitations & comptes', back: '/profil' })}
    <main class="page-content acc acc-admin">
      ${A.error ? `<div class="acc-banner">${icon('info')} ${escapeHtml(A.error)}</div>` : ''}
      <section class="card acc-new">
        <h2 class="acc-admin__title">${icon('plus')} Nouvelle invitation</h2>
        <div class="acc-new__grid">
          ${field({ id: 'inv-note', label: 'Pour qui ? (facultatif)', attrs: 'maxlength="80" placeholder="Ex. : Yasmine"' })}
          <label class="acc-field"><span class="acc-field__label">Utilisations</span>
            <span class="acc-field__box"><select id="inv-uses">${[1, 2, 5, 10, 25].map(n => `<option value="${n}">${n}</option>`).join('')}</select></span></label>
          <label class="acc-field"><span class="acc-field__label">Valable</span>
            <span class="acc-field__box"><select id="inv-days">${[[7, '7 jours'], [30, '30 jours'], [90, '3 mois'], [365, '1 an']].map(([v, l]) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>${l}</option>`).join('')}</select></span></label>
        </div>
        <button class="btn btn--primary btn--block" id="inv-create">${icon('plus')} Créer le code</button>
      </section>

      <section class="section">
        <div class="section__head"><h2 class="section__title">Invitations</h2></div>
        ${A.invites.length ? `<ul class="acc-list">${A.invites.map(i => {
          const st = inviteState(i);
          const active = st.cls === 'badge--gold';
          return `
            <li class="acc-item">
              <div class="acc-item__main">
                <span class="acc-code">${escapeHtml(i.code)}</span>
                <span class="badge ${st.cls}">${st.label}</span>
              </div>
              <div class="acc-item__meta">${i.note ? `${escapeHtml(i.note)} · ` : ''}créée le ${fmtDate(i.created_at)}${i.expires_at ? ` · expire le ${fmtDate(i.expires_at)}` : ''}</div>
              ${active ? `
                <div class="acc-item__actions">
                  <button class="btn btn--tonal btn--sm" data-share="${escapeHtml(i.code)}">${icon('link')} Partager le lien</button>
                  <button class="btn btn--ghost btn--sm" data-revoke="${escapeHtml(i.code)}">Révoquer</button>
                </div>` : ''}
            </li>`;
        }).join('')}</ul>` : '<p class="acc-empty">Aucune invitation pour l’instant.</p>'}
      </section>

      <section class="section">
        <div class="section__head"><h2 class="section__title">Comptes · ${A.users.length}</h2></div>
        <ul class="acc-list">${A.users.map(u => `
          <li class="acc-item">
            <div class="acc-item__main">
              <span class="acc-item__email">${escapeHtml(u.email)}</span>
              ${u.is_admin ? '<span class="badge badge--primary">admin</span>' : ''}
            </div>
            <div class="acc-item__meta">inscrit le ${fmtDate(u.created_at)} · dernière connexion ${fmtDate(u.last_login_at)} · ${u.sessions} appareil${u.sessions > 1 ? 's' : ''}</div>
            ${u.is_admin ? '' : `<div class="acc-item__actions"><button class="btn btn--ghost btn--sm" data-reset="${escapeHtml(u.email)}">${icon('rotate-ccw')} Mot de passe provisoire</button></div>`}
          </li>`).join('')}</ul>
      </section>
    </main>`;

  document.getElementById('inv-create').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { code } = await api('admin/invites', { method: 'POST', body: {
        note: document.getElementById('inv-note').value,
        maxUses: Number(document.getElementById('inv-uses').value),
        days: Number(document.getElementById('inv-days').value),
      } });
      haptic();
      await renderAdmin();
      shareInvite(code);
    } catch (err) { btn.disabled = false; toast(err.message, { icon: 'info' }); }
  });
  $app().querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => shareInvite(b.dataset.share)));
  $app().querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', () => {
    showConfirmModal('Révoquer cette invitation ?', `Le code ${b.dataset.revoke} ne pourra plus servir. Les comptes déjà créés ne sont pas touchés.`, async () => {
      await api(`admin/invites?code=${encodeURIComponent(b.dataset.revoke)}`, { method: 'DELETE' }).catch(err => toast(err.message, { icon: 'info' }));
      renderAdmin();
    }, null, { confirmLabel: 'Révoquer', danger: true });
  }));
  $app().querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
    showConfirmModal('Mot de passe provisoire ?', `Le mot de passe de ${b.dataset.reset} sera remplacé et ses appareils déconnectés. Tu lui transmettras le mot de passe provisoire.`, async () => {
      try {
        const { email, temporary } = await api('admin/reset-password', { method: 'POST', body: { email: b.dataset.reset } });
        showSecret('Mot de passe provisoire', `À transmettre à ${email}. Il devra en choisir un nouveau à sa connexion.`, temporary);
        renderAdmin();
      } catch (err) { toast(err.message, { icon: 'info' }); }
    }, null, { confirmLabel: 'Générer', danger: true });
  }));
}

function shareInvite(code) {
  const link = inviteLink(code);
  showSecret('Invitation prête', 'Envoie ce lien (ou le code seul) à la personne invitée.', code, link);
}

function showSecret(title, text, secret, link = '') {
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title">${escapeHtml(title)}</span>
          <button class="modal__close" id="modal-close" aria-label="Fermer">${icon('x')}</button>
        </div>
        <p class="confirm-modal__message">${escapeHtml(text)}</p>
        <div class="acc-secret">${escapeHtml(secret)}</div>
        ${link ? `<div class="acc-secret acc-secret--link">${escapeHtml(link)}</div>` : ''}
        <div class="btn-stack">
          ${link && navigator.share ? `<button class="btn btn--primary btn--block" id="sec-share">${icon('upload')} Partager</button>` : ''}
          <button class="btn ${link && navigator.share ? 'btn--secondary' : 'btn--primary'} btn--block" id="sec-copy">${icon('layers')} Copier ${link ? 'le lien' : ''}</button>
        </div>
      </div>
    </div>`);
  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.getElementById('sec-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link || secret); toast('Copié', { icon: 'check-circle' }); } catch { toast('Copie impossible : sélectionne le texte', { icon: 'info' }); }
  });
  document.getElementById('sec-share')?.addEventListener('click', () => {
    navigator.share({ title: 'Invitation HelloArabic', text: `Rejoins-moi sur HelloArabic (code ${secret})`, url: link }).catch(() => {});
  });
}
