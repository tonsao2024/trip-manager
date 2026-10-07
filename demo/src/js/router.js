// Lightweight hash router
export class Router {
  constructor(routes, defaultRoute = '#/login') {
    this.routes = routes;
    this.defaultRoute = defaultRoute;
    this.current = null;
    this.params = {};
    this.beforeEach = null;
  }

  init() {
    window.addEventListener('hashchange', () => this.handle());
    this.handle();
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
    let hash = location.hash || this.defaultRoute;
    if (!hash.startsWith('#')) hash = '#' + hash;
    let path = hash.slice(1);
    const queryIndex = path.indexOf('?');
    const pathWithoutQuery = queryIndex >= 0 ? path.slice(0, queryIndex) : path;

    const matched = this.match(pathWithoutQuery);
    if (!matched) {
      if (pathWithoutQuery !== path) {
        const fallback = this.match(pathWithoutQuery);
        if (fallback) {
          if (this.beforeEach) {
            try {
              const res = await this.beforeEach(fallback);
              if (res === false) return;
            } catch (e) { console.warn('beforeEach failed', e?.message); }
          }
          this.current = fallback;
          this.run(fallback.handler, fallback.params);
          return;
        }
      }
      location.hash = this.defaultRoute;
      return;
    }
    if (this.beforeEach) {
      try {
        const res = await this.beforeEach(matched);
        if (res === false) return;
      } catch (e) { console.warn('beforeEach failed', e?.message); }
    }
    // Avoid re-running same route with same params unless forced
    const sameRoute = this.current && this.current.path === matched.path && JSON.stringify(this.current.params) === JSON.stringify(matched.params);
    if (sameRoute && document.getElementById('app')?.dataset.route === matched.path) {
      // still dispatch start/end to keep progress consistent but skip heavy re-render
      // For now allow re-render but ensure quick return if already on same page and no query change
      const currentQuery = location.hash.includes('?') ? location.hash.split('?')[1] : '';
      const prevQuery = this.current?.fullPath?.includes('?') ? this.current.fullPath.split('?')[1] : '';
      if (currentQuery === prevQuery) return;
    }
    this.current = matched;
    this.run(matched.handler, matched.params);
  }

  match(path) {
    // Strip query for matching
    const cleanPath = path.split('?')[0];
    for (const route of this.routes) {
      const paramNames = [];
      const pattern = route.path.replace(/:([^/]+)/g, (_, name) => { paramNames.push(name); return '([^/]+)'; });
      const regex = new RegExp(`^${pattern}$`);
      const m = cleanPath.match(regex);
      if (m) {
        const params = {};
        paramNames.forEach((n, i) => params[n] = m[i+1]);
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
