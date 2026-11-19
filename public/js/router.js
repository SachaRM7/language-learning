// js/router.js — Hash router avec params

const routes = {};
let _currentRoute = { path: '/', params: {} };

export function route(pattern, handler) {
  routes[pattern] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return { ..._currentRoute };
}

function matchRoute(hash) {
  const raw = hash.replace(/^#\/?/, '');
  const path = '/' + raw.replace(/^\//, '');

  if (routes[path]) {
    return { handler: routes[path], params: {}, path };
  }

  for (const pattern of Object.keys(routes)) {
    const regex = new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$');
    const match = path.match(regex);
    if (match) {
      const paramNames = (pattern.match(/:\w+/g) || []).map(p => p.slice(1));
      const params = {};
      paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      return { handler: routes[pattern], params, path };
    }
  }

  return null;
}

function dispatch(hash) {
  const result = matchRoute(hash);
  if (!result) { navigate('/home'); return; }
  _currentRoute = { path: result.path, params: result.params };

  const run = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('.feedback-bar, .modal-overlay').forEach(el => el.remove());
    return result.handler(result.params);
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce && _hasRendered) {
    const t = document.startViewTransition(async () => { await run(); });
    // Une navigation rapide interrompt la transition précédente : ce n'est pas une erreur
    t.ready.catch(() => {});
    t.finished.catch(() => {});
  } else {
    const app = document.getElementById('app');
    if (app && _hasRendered) {
      app.classList.add('page-entering');
      setTimeout(() => app.classList.remove('page-entering'), 400);
    }
    run();
  }
  _hasRendered = true;
}

let _hasRendered = false;

export function startRouter() {
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-navigate]');
    if (el) {
      e.preventDefault();
      navigate(el.dataset.navigate);
    }
  });

  window.addEventListener('hashchange', () => {
    dispatch(window.location.hash);
  });

  dispatch(window.location.hash);
}
