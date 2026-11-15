---
name: ui-quality-gate
description: Measure accessibility, layout shift and load performance of this dashboard on its production build, before and after a frontend change. Use when a change touches frontend/src, frontend/index.html or src/index.css, or when asked to audit a11y, CLS, LCP or bundle size here.
---

# UI quality gate

## Objective

Give every frontend change before/after numbers taken the same way, on the
production build, so a regression in accessibility, layout shift or loading
is caught before commit. It complements `.agents/skills/verify-changes`, which
covers tests, lint, build and API health but nothing visual or performance.

## Inputs

- A frontend change in the working tree, or a commit to compare against.
- Docker running, with `docker compose up -d` done (the backend must be up).
- Google Chrome installed (`/Applications/Google Chrome.app` on macOS).
- The last recorded numbers in `memory-bank/progress.md`, section
  "Quality baseline". If you have no baseline, run steps 1–4 on the commit
  before your change first.

## Outputs

A short table in your report, and in the commit message, with before → after
for every row of the acceptance criteria, plus anything you could not measure.

## Steps

Run from the repo root. `S` is any scratch folder outside the repo.

1. **Build and serve production.** The dev server on 5173 is not usable for
   performance: it serves unminified modules (Lighthouse gave 55 there and 97
   on the build). `vite preview` reuses `server.proxy`, so `/api` works.

   ```bash
   docker compose exec -T frontend npm run build      # must print no "(!)" warning
   docker rm -f fe-preview 2>/dev/null
   docker compose run -d --rm --name fe-preview -p 4173:4173 frontend \
     npx vite preview --host 0.0.0.0 --port 4173
   curl -s -o /dev/null -w "%{http_code}\n" localhost:4173/api/metrics/facets  # 200
   ```

   Restart `fe-preview` after every build.

2. **Lighthouse, median of 3.** One run is noise.

   ```bash
   .skills/ui-quality-gate/scripts/lighthouse-median.sh http://localhost:4173 <label> "$S"
   ```

   Report both LCP values it prints. The simulated one (Lantern, slow 4G)
   penalizes extra requests, so code splitting can move it up while the
   observed one goes down. In `aecad02`: observed 155 → 91 ms, simulated
   2.28 → 2.43 s. State both; never report only the favorable one.

3. **Browser checks Lighthouse misses.** Lighthouse scored accessibility 100
   while the chart axis text was 3.14:1, because it does not check SVG text.

   ```bash
   P=$(ls -d ~/.npm/_npx/*/node_modules/puppeteer-core | head -1)  # installed by step 2
   node .skills/ui-quality-gate/scripts/ui-checks.mjs "$P" http://localhost:4173
   ```

   It prints tab stops with their accessible names, the heading outline,
   text contrast (including `.recharts-text`), the skeleton animation under
   `prefers-reduced-motion`, the first paint with JavaScript disabled, and
   layout shifts with their source nodes at 412×823 and 1280×900.

4. **Keyboard pass by hand.** Tab to each chart; Left/Right must move the
   tooltip. With VoiceOver (Cmd+F5), the rotor (Ctrl+Opt+U) must list the
   headings and each chart's data table.

5. **Stop the preview:** `docker rm -f fe-preview`.

## Acceptance criteria

| Check | Pass |
|---|---|
| `npm run build` | No `(!)` warning; no raised `chunkSizeWarningLimit` |
| Lighthouse accessibility (median) | 100 |
| Lighthouse CLS (median) | 0.000 |
| Observer CLS, both viewports | 0.0000 |
| Every tab stop | Has a non-empty name |
| Text contrast, including chart ticks | ≥ 4.5:1 for text under 18px |
| Skeleton under reduced motion | `animationName` is `none` |
| First paint without JS | Dark background (`oklch(0.13 …)`) |
| Observed LCP | Not worse than the baseline; if it is, say why |

A failed row blocks the commit unless the report explains it and the student
accepts it.

## Repo traps (each one happened here)

- **`--color-*` vs raw tokens.** The `@theme inline` variables resolve on the
  root element. They are dark only because `index.html` puts `.dark` on
  `<html>`. If `.dark` ever moves back to a child, `var(--color-…)` in Recharts
  props turns light again; use the raw tokens (`var(--muted-foreground)`).
- **Do not trust the shifted node.** The KPI section moved, but the cause was
  the header's period badge arriving from `/facets`. Read `sources` from the
  observer before fixing.
- **Skeletons must match the loaded size.** A skeleton shorter than the real
  card shifted the page by 0.0144. Render static text for real; skeleton only
  the data.
- **`sr-only` on a `<table>` does not shrink it** (measured 217×336 px). Put
  `sr-only` on a wrapping `div`.
- **The bundle is mostly Recharts.** Any new chart goes through the lazy
  imports in `App.tsx`, and the chart chunk loads only after the data, so it
  does not compete with `/api/metrics` (the LCP element is a KPI value).
