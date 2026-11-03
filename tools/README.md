# Local development tools

These helpers are not loaded by the app.

## `tools/build-assets.mjs` — compile the shipped CSS + icon bundle

The app used to pull the Tailwind **Play CDN** (a runtime JIT compiler) and the
**full Lucide** icon bundle from a CDN at page load. Both are now precompiled and
committed so first paint needs no runtime compilation and no third-party round
trip:

| Output | What it replaces | Size |
| --- | --- | --- |
| `src/css/tailwind.css` | Tailwind Play CDN runtime compiler | ~18 kB (minified) |
| `src/js/vendor/lucide.js` | Full `lucide` UMD (~550 kB) | ~114 kB (291 icons actually used) |

Run it **after adding/changing Tailwind utility classes or `data-lucide` icon
names** in `index.html` or `src/js/**`, then commit the two generated files:

```bash
npm install            # dev deps are pinned in the root package.json
node tools/build-assets.mjs
```

The build is dev-only: it needs `tailwindcss` and `lucide` from `package.json`.
The generated files are plain static assets, so the GitHub Pages workflow (which
has no build step) ships them as-is. If you forget to rebuild after a class/icon
change, the new class/icon will be missing until you do — the icon scanner also
keeps a safety net of common icons so small misses degrade gracefully.

## `tools/preview/` — visual page review

| File | Purpose |
| --- | --- |
| `build.mjs` | Runs the app routes in jsdom with the smoke-test stubs and writes HTML snapshots to `tools/preview/out/`. |
| `shot.mjs` | Wraps snapshots in the app styles and captures screenshots with headless Chromium. |
| `tailwind.config.cjs`, `tailwind.in.css` | Tailwind inputs used for the local snapshots. |

Install the optional tooling from the repository root (all dev dependencies are
pinned in `package.json`, so a plain install is enough):

```bash
npm install
```

Build snapshots (optionally name a route such as `dashboard`):

```bash
node tools/preview/build.mjs [route]
```

To capture them, serve the repository root on port 8099 and run the screenshot helper:

```bash
python3 -m http.server 8099 --bind 0.0.0.0
node tools/preview/shot.mjs [width] [route]
```

Generated snapshots and screenshots are written under `tools/preview/out/` and are git-ignored.
