// Lightweight hash router.
//
// v33: handle() now awaits the route handler and returns its promise, so callers
// (Refresh button, post-save redirects) can await a real completion instead of
// firing-and-forgetting. A navigation token drops stale work: if the user taps a
// second menu while the first is still reading Firestore, the first render is
// abandoned once its async guard resumes. The dead "fallback re-match" branch
// (it re-matched the exact path that had just failed) was removed.
export class Router {
  constructor(routes, defaultRoute = '#/login') {
    this.routes = routes;
    this.defaultRoute = defaultRoute;
    this.current = null;
    this.params = {};
    this.beforeEach = null;
    this._navToken = 0;
    // Pre-compile each route pattern once instead of rebuilding a RegExp on
    // every navigation.
    this._compiled = this.routes.map(route => {
      const paramNames = [];
      const pattern = route.path.replace(/:([^/]+)/g, (_, name) => { paramNames.push(name); return '([^/]+)'; });
      return { route, paramNames, regex: new RegExp(`^${pattern}$`) };
    });
  }

  init() {
    window.addEventListener('hashchange', () => this.handle());
    return this.handle();
  }

  /**
   * Route handlers are async; awaiting them lets the UI show progress and lets
   * the next navigation cancel the previous render (render tokens).
   */
  async run(handler, params) {
    window.dispatchEvent(new CustomEvent('route:start'));
    try {
      await handler(params);
    } catch (e) {
      console.error('route handler failed', e);
    } finally {
      window.dispatchEvent(new CustomEvent('route:end'));
    }
  }

  async handle() {
    const token = ++this._navToken;
    let hash = location.hash || this.defaultRoute;
    if (!hash.startsWith('#')) hash = '#' + hash;
    const path = hash.slice(1);

    const matched = this.match(path);
    if (!matched) {
      location.hash = this.defaultRoute;
      return;
    }

    // NOTE: we deliberately always run the handler. Manual Refresh and theme
    // changes call handle() on the *current* route and rely on a real re-render
    // (they clear the read cache first). Redundant-render protection lives in the
    // app's render tokens, not here, so those flows keep working.

    if (this.beforeEach) {
      try {
        const res = await this.beforeEach(matched);
        if (res === false) return;
      } catch (e) { console.warn('beforeEach failed', e?.message); }
    }
    // A newer navigation may have started while beforeEach was awaiting auth.
    if (token !== this._navToken) return;

    this.current = matched;
    const appEl = document.getElementById('app');
    if (appEl) appEl.dataset.route = matched.path;
    await this.run(matched.handler, matched.params);
  }

  match(path) {
    const cleanPath = path.split('?')[0];
    for (const { route, paramNames, regex } of this._compiled) {
      const m = cleanPath.match(regex);
      if (m) {
        const params = {};
        paramNames.forEach((n, i) => params[n] = m[i + 1]);
        return { ...route, params, path: cleanPath, fullPath: path };
      }
    }
    return null;
  }

  navigate(path) {
    if (!path.startsWith('#')) path = '#' + path;
    location.hash = path;
  }
}
