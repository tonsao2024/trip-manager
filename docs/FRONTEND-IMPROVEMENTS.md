# Frontend improvement guide

## Current boundaries

- `src/js/app.js` remains the SPA composition root: it owns route handlers and shared shell orchestration.
- Feature CRUD/UI modules own their domain workflows; pure calculations and normalization belong in `src/js/utils/` and should remain Firebase-independent where possible.
- `src/js/navigation.js` is the shared registry for the eight primary trip navigation entries and the secondary header-menu entries. It supplies localized labels, icons, groups and encoded route destinations. Mobile More still groups additional shortcuts for task-oriented discovery.
- `src/js/router.js` owns hash matching, navigation guards, stale navigation protection and route lifecycle events. New routes should be added there via the app route table; do not duplicate route parsing inside feature modules.
- Data access and authorization remain in Firebase modules/rules/Functions. Never treat hidden UI as authorization.

## Theme and accessibility contract

- Colour theme (`fuji_color_theme`) and light/dark/auto mode are **device-local browser preferences**. They are not trip settings and do not sync to other devices. UI shape preferences (`fuji_ui_style`) are also device-local.
- Presets and custom palettes must provide both light and dark canvas values. Primary foreground text is selected using WCAG 2.x relative luminance and contrast ratio; normal text on the primary action must reach 4.5:1.
- Preview theme changes before choosing; expose the selected preset with `aria-pressed`; label custom color inputs and keep the preview in the accessibility tree.
- Do not assume brand/accent colours are suitable for text. For status communicate meaning with text/icon as well as color.
- Keep component structure in `components.css` / `refresh.css`; visual alterations belong in `flat.css`. Use semantic tokens from `tokens.css` rather than hard-coded status colours. Existing success/warning/danger, focus and surface tokens should be preferred over new one-off values.
- Keep touch targets, visible keyboard focus and reduced-motion support intact for all density/radius/depth combinations.

## Safe change process

1. Identify the owning feature and its routes/data writes before editing.
2. Prefer a small module-level change with pure logic separated from Firebase/UI dependencies.
3. Add/update a unit test for pure logic and a smoke test for a user-visible route or action.
4. Check both permission success and denied states, empty/error/loading states, mobile shell and hash/deep-link behavior.
5. Do not move preference data into Firestore or change database/API/auth contracts without a separate migration and impact review.

## Follow-up engineering

- Add route titles, required capability and breadcrumb metadata to the app route table as pages are changed, then use that metadata for deep-link guards and breadcrumbs. Primary and secondary nav links now share a registry; do not force every secondary action into the eight-item row.
- Continue extracting only cohesive orchestration from `app.js`, one domain at a time, after adding characterization tests. A full rewrite or framework migration is not justified by current test results.
- Add visual browser coverage for all themes × both appearance modes and representative compact/regular/roomy layouts when Chromium libraries are available in CI.
- A persistent/synced theme, saved user palettes, and theme import/export are optional product features. Specify whether preferences belong to account or device before changing storage.
