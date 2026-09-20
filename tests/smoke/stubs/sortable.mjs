export default class Sortable {
  constructor(el, opts = {}) { this.el = el; this.options = opts; }
  destroy() {}
  toArray() { return []; }
}
export const Sortable = Sortable;
