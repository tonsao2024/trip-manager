# PDF / PNG export audit

## Entry points traced

- Itinerary: full-trip PNG and per-day PNG; both capture the live map when possible and fall back to the schematic.
- Share → Print/save PDF: the itinerary `?print=1` route now builds the complete itinerary sheet and downloads its PDF (the parameter was previously ignored).
- Settlement: overview/current-view PNG and PDF, per-member receipt PNG, receipt sharing via canvas, standalone debt-map PNG.
- Import/export page and calendar: native print/save-PDF, including calendar auto-print.

## Shared fixes

- Wait for self-hosted Thai/Latin fonts at actual weights and image decoding before measuring.
- Expand capture layout before computed-style cloning: full text instead of truncation, scroll areas expanded, hidden receipt continuation rows included, extra space for Thai marks and borders. Restore the original source classes/styles/hidden state afterwards.
- Paper/ink export palette is independent of light/dark and brand theme; preserve SVG fills rather than applying icon-only `fill:none` to whole diagrams.
- Carry SVG text styles, embedded fonts and CORS photos into both HTML captures and standalone diagrams. Copy source canvas pixels into clones.
- PDF uses the same rendering pipeline as PNG. A4 pages have margins, compressed image slices, and boundaries chosen outside measured text lines/table rows/diagrams when they fit on a page. An individual oversized row/diagram necessarily spans pages.
- Bound canvas dimensions for long exports rather than exceeding browser canvas limits. Very long exports can consequently have reduced raster resolution.
- Native print: paper colours, wrapping, repeatable table headers and sensible page-break rules. Wait for fonts/images before invoking print.

## Validation

- `npm test`: pure-logic suite, including page-cut and debt-map regressions.
- `npm run test:browser:export`: real Chromium + real html2canvas/jsPDF, served locally with the production styles/fonts. Receipt/itinerary PNGs, standalone and embedded SVG captures, long Thai/Latin content, 14 themes × light/dark, representative text contrast checks, source restoration/clone cleanup, multi-page A4 PDF, native-print PDF.
- Browser artifacts stay in ignored `tests/browser/out/`.

The browser suite uses deterministic fixtures, not a signed-in production trip. It verifies export helpers and representative layouts, not every live-data combination or operating system's print dialog. On minimal Linux sandboxes Chromium may need its bundled `al2023` shared libraries extracted (the test launcher already includes `/tmp/al2023/lib` in `LD_LIBRARY_PATH`).
