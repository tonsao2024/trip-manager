# tools/ — local dev helpers (not part of the app)

Nothing in this folder is loaded by the app. It exists so the design can be
reviewed and the offline demo rebuilt from a plain checkout.

## `tools/preview/` — design review + offline demo

| File | What it does |
| --- | --- |
| `build.mjs` | Renders every route of the app in jsdom (against the smoke-test Firebase stubs) and writes plain HTML snapshots of each page into `out/` |
| `shot.mjs` | Wraps those snapshots in a real page (local CSS/fonts/Lucide + a pre-built Tailwind) and screenshots them in headless Chromium → `out/shots/<width>/` |
| `standalone.mjs` | **Builds `demo/`** — the fully offline, self-contained example web version |
| `shot-demo.mjs` | Screenshots any URL (used for the demo) |
| `firebase/*.js` | ES-module stand-ins for `firebase/app|auth|firestore|storage|functions` (in-memory store) |
| `stubs/*.js` | ES-module stand-ins for Leaflet (draws a stylised map), Sortable, html2canvas, jsPDF |
| `vendor-src/dayjs-full.js` | dayjs + the four plugins the app registers, bundled as one ESM file |

### Rebuild the offline demo

```bash
npm install --no-save jsdom dayjs xlsx puppeteer-core @sparticuz/chromium \
  tailwindcss@3.4.17 lucide@0.460.0 esbuild \
  @fontsource/outfit @fontsource/plus-jakarta-sans @fontsource/noto-sans-thai

# only needed when dayjs itself changes (writes vendor-src/dayjs-full.js)
npx esbuild --bundle --format=esm --minify \
  tools/preview/vendor-src/dayjs-entry.js \
  --outfile=tools/preview/vendor-src/dayjs-full.js

node tools/preview/standalone.mjs        # → demo/
python3 -m http.server 8099 --bind 0.0.0.0   # then open /demo/
```

`demo/` is committed on purpose: GitHub Pages serves it at
`https://tonsao2024.github.io/trip-manager/demo/` so the full feature set can be
tried without a Firebase project. Everything else this folder produces
(`tools/preview/out/`, `tools/preview/demo/`) is git-ignored.

Headless Chromium in a bare container needs the shared libraries that ship with
`@sparticuz/chromium`:

```bash
node -e "const fs=require('fs'),z=require('zlib');const {pipeline}=require('stream/promises');
pipeline(fs.createReadStream('node_modules/@sparticuz/chromium/bin/al2023.tar.br'),
  z.createBrotliDecompress(), fs.createWriteStream('/tmp/al2023.tar'))"
mkdir -p /tmp/chlibs && tar -xf /tmp/al2023.tar -C /tmp/chlibs
# the shot scripts pass LD_LIBRARY_PATH=/tmp/chlibs/lib:/tmp to the browser
```
