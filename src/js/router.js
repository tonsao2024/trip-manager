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

  handle() {
    let hash = location.hash || this.defaultRoute;
    if (!hash.startsWith('#')) hash = '#' + hash;
    let path = hash.slice(1); // remove #
    // Strip query string for matching but keep full path for handler
    const queryIndex = path.indexOf('?');
    const pathWithoutQuery = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
    
    const matched = this.match(pathWithoutQuery);
    if (!matched) {
      // Try to match without query, if still no match go to default
      if (pathWithoutQuery !== path) {
        const fallback = this.match(pathWithoutQuery);
        if (fallback) {
          if (this.beforeEach) {
            const res = this.beforeEach(fallback);
            if (res === false) return;
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
      const res = this.beforeEach(matched);
      if (res === false) return;
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
