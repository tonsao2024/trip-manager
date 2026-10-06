// Smoke stub for SortableJS. It keeps a live-instance counter so the test can
// prove drag handles exist ONLY in edit mode (a v19 request).
export const __sortable = { created: 0, live: 0, instances: [] };

export default class Sortable {
  constructor(el, opts = {}) {
    this.el = el;
    this.options = opts;
    this.__live = true;
    __sortable.created += 1;
    __sortable.live += 1;
    __sortable.instances.push(this);
  }
  destroy() {
    if (!this.__live) return;
    this.__live = false;
    __sortable.live -= 1;
  }
  toArray() { return []; }
  static create(el, opts) { return new Sortable(el, opts); }
}

export { Sortable };
