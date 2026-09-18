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

  handle() {
    let hash = location.hash || this.defaultRoute;
    if (!hash.startsWith('#')) hash = '#' + hash;
    const path = hash.slice(1); // remove #
    const matched = this.match(path);
    if (!matched) {
      location.hash = this.defaultRoute;
      return;
    }
    if (this.beforeEach) {
      const res = this.beforeEach(matched);
      if (res === false) return;
    }
    this.current = matched;
    matched.handler(matched.params);
  }

  match(path) {
    // path like /trip/:tripId/dashboard
    for (const route of this.routes) {
      const paramNames = [];
      const pattern = route.path.replace(/:([^/]+)/g, (_, name) => { paramNames.push(name); return '([^/]+)'; });
      const regex = new RegExp(`^${pattern}$`);
      const m = path.match(regex);
      if (m) {
        const params = {};
        paramNames.forEach((n, i) => params[n] = m[i+1]);
        return { ...route, params, path };
      }
    }
    return null;
  }

  navigate(path) {
    if (!path.startsWith('#')) path = '#' + path;
    location.hash = path;
  }
}
