// Accessibility pass for rendered markup (round 5).
//
// The app renders most screens from HTML strings. Over the years 100+ form
// labels were written as a sibling `<label class="input-label">` without a
// `for`, and many icon-only buttons only carry a `title` (a hover tooltip that
// touch users and some screen readers never get). Rather than chase every
// template, one pass runs on each subtree the app adds to the page:
//
//   • a label without `for` points at the field that follows it in its group;
//   • an icon-only button / link with a `title` gets the same words as aria-label;
//   • a text field with no label and no name falls back to its placeholder.
//
// It only fills gaps — anything a template already set is left alone.

const FIELD = 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea';
const GROUP = '.input-group, .form-group, .field';
let seq = 0;

const isElement = (node) => Boolean(node) && node.nodeType === 1;
const isChoice = (el) => el.tagName === 'INPUT' && /^(?:checkbox|radio)$/.test(el.type);

/** The first form field after `label` inside `scope`, or null when something else comes first. */
function fieldAfter(label, scope) {
  const doc = label.ownerDocument;
  if (!doc?.createTreeWalker) return null;
  const walker = doc.createTreeWalker(scope, 1 /* NodeFilter.SHOW_ELEMENT */);
  walker.currentNode = label;
  let node = walker.nextNode();
  while (node) {
    if (!label.contains(node)) {
      // Another label, or a control that cannot be labelled (a button / a segmented
      // choice), means the label belongs to that group — never guess past it.
      if (node.tagName === 'LABEL' || node.tagName === 'BUTTON' || node.getAttribute('role') === 'radiogroup') return null;
      if (node.matches(FIELD)) return isChoice(node) ? null : node;
    }
    node = walker.nextNode();
  }
  return null;
}

/** `<label class="input-label">ชื่อ</label><input id="x">` → `<label for="x">`. */
export function linkFormLabels(root) {
  if (!root?.querySelectorAll) return 0;
  let linked = 0;
  const labels = [...(isElement(root) && root.matches('label') ? [root] : []), ...root.querySelectorAll('label:not([for])')];
  for (const label of labels) {
    if (label.hasAttribute('for') || label.querySelector(FIELD)) continue;
    const scope = label.closest(GROUP) || label.parentElement;
    if (!scope) continue;
    const field = fieldAfter(label, scope);
    if (!field || (field.labels && field.labels.length) || field.hasAttribute('aria-labelledby')) continue;
    if (!field.id) field.id = `fld-${++seq}`;
    if (label.ownerDocument.getElementById(field.id) === field) {
      label.htmlFor = field.id;
    } else {
      // The id is taken by another element (two copies of a form on the page):
      // for= would name the wrong field, so point the field at its label instead.
      if (!label.id) label.id = `lbl-${++seq}`;
      field.setAttribute('aria-labelledby', label.id);
    }
    linked += 1;
  }
  return linked;
}

/** Icon-only buttons and links: the tooltip text becomes their accessible name. */
export function nameIconControls(root) {
  if (!root?.querySelectorAll) return 0;
  let named = 0;
  const sel = 'button[title]:not([aria-label]), a[title]:not([aria-label]), [role="button"][title]:not([aria-label])';
  const list = [...(isElement(root) && root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)];
  for (const el of list) {
    const title = (el.getAttribute('title') || '').trim();
    if (!title || el.textContent.trim()) continue;
    el.setAttribute('aria-label', title);
    named += 1;
  }
  return named;
}

/** A text field nobody labelled (search boxes) is named by its placeholder. */
export function nameBareFields(root) {
  if (!root?.querySelectorAll) return 0;
  let named = 0;
  const list = [...(isElement(root) && root.matches(FIELD) ? [root] : []), ...root.querySelectorAll(FIELD)];
  for (const el of list) {
    if (isChoice(el) || (el.labels && el.labels.length)) continue;
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.hasAttribute('title')) continue;
    const hint = (el.getAttribute('placeholder') || '').trim();
    if (!hint) continue;
    el.setAttribute('aria-label', hint);
    named += 1;
  }
  return named;
}

/** Run every fix on one subtree; returns how many gaps were filled. */
export function enhanceA11y(root) {
  if (!root) return 0;
  try {
    return linkFormLabels(root) + nameIconControls(root) + nameBareFields(root);
  } catch (e) {
    console.warn('a11y pass failed', e);
    return 0;
  }
}

/** Fix what is on the page now, then every subtree added later (sheets, lists, routes). */
export function observeA11y(target = typeof document !== 'undefined' ? document.body : null) {
  if (!target) return null;
  enhanceA11y(target);
  if (typeof MutationObserver === 'undefined') return null;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isElement(node)) enhanceA11y(node);
      }
    }
  });
  observer.observe(target, { childList: true, subtree: true });
  return observer;
}
