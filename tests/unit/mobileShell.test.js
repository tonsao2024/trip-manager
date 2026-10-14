// Regression checks for the mobile top safe area / browser chrome.
import fs from 'node:fs';
import path from 'node:path';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const root = path.resolve(import.meta.dirname, '../..');

export function testMobileHeaderIntegratesTheSafeArea() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(html.includes('@media (max-width: 767px)'), 'mobile-only shell rules are present');
  assert(html.includes('--header-h: calc(56px + env(safe-area-inset-top, 0px))'),
    'sticky offsets include the iPhone top safe area');
  assert(html.includes('padding-top: env(safe-area-inset-top, 0px);'),
    'the header paints behind the status-bar safe area');
  assert(html.includes('#app-header .header-row {\n        height: 56px;\n        padding-left: max(16px, env(safe-area-inset-left, 0px));'),
    'the phone toolbar is compact and respects horizontal cutouts');
  assert(html.includes('#app { padding-top: 14px; }'), 'mobile content starts closer to the top bar');
}

export function testBrowserChromeMatchesTheHeaderTheme() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/css/tokens.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  const metaColor = html.match(/<meta name="theme-color" id="meta-theme-color" content="([^"]+)"/)?.[1];
  const themeColorRules = css.match(/--app-chrome-color: color-mix\(in srgb, var\(--surface\) 80%, var\(--bg\)\);/g) || [];
  const updater = app.match(/function updateMetaThemeColor\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert(themeColorRules.length === 2, 'light and dark modes both derive a neutral chrome surface');
  assert(metaColor === '#f7fbff' && manifest.theme_color === metaColor && manifest.background_color === metaColor,
    'the initial document and installed PWA use the same neutral fallback');
  assert(html.includes("document.documentElement.setAttribute('data-theme', 'dark')")
    && html.includes("setAttribute('content', 'black-translucent')"),
    'a saved dark theme configures the iOS status area before first paint');
  assert(html.includes('name="apple-mobile-web-app-status-bar-style" id="meta-apple-status-bar-style"'),
    'the iOS home-screen app declares a controllable status-bar style');
  assert(updater.includes("effectiveTheme() === 'dark' ? 'black-translucent' : 'default'"),
    'iOS status-bar glyphs follow the active light/dark theme');
  assert(updater.includes("getPropertyValue('--app-chrome-color')"),
    'runtime theme changes update the browser color from the actual chrome token');
  assert(updater.includes("chromeColor || '#f7fbff'"), 'the runtime keeps a safe fallback if CSS is unavailable');
  assert(updater.includes('faviconSvg(pal.blue || BRAND_PRIMARY'),
    'the favicon still follows the vivid brand color');
}
