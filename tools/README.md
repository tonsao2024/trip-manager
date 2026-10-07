# Local development tools

These helpers are not loaded by the app.

## `tools/preview/` — visual page review

| File | Purpose |
| --- | --- |
| `build.mjs` | Runs the app routes in jsdom with the smoke-test stubs and writes HTML snapshots to `tools/preview/out/`. |
| `shot.mjs` | Wraps snapshots in the app styles and captures screenshots with headless Chromium. |
| `tailwind.config.cjs`, `tailwind.in.css` | Tailwind inputs used for the local snapshots. |

Install the optional tooling from the repository root:

```bash
npm install --no-save jsdom dayjs xlsx puppeteer-core @sparticuz/chromium \
  tailwindcss@3.4.17 lucide@0.460.0 \
  @fontsource/outfit @fontsource/plus-jakarta-sans @fontsource/noto-sans-thai
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
