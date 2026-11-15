# Progress

What changed in each session, how it was verified, and what is left. Newest
first. Dates are absolute.

## 2026-11-14 — Agent skills (`feature/agent-skills`)

The agent applied community skills to targeted fixes; the student reviewed and
approved each change before its commit. No rewrite: every change maps to a rule
or section of a loaded skill.

### Skills used

| Skill | Source | How it was found | Applied in |
|---|---|---|---|
| `accessibility` | `addyosmani/web-quality-skills` (70.4K installs) | `npx skills find accessibility` | `9fdecc5` |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` (899.8K) | `npx skills find vercel-react-best-practices` | `aecad02` |
| `core-web-vitals` | `addyosmani/web-quality-skills` (35.4K) | `npx skills find "core web vitals"` | `b33a7fb` |
| `ui-quality-gate` (internal) | `.skills/ui-quality-gate/` | Written from this session's evidence | Used to verify the branch |

All three community skills are installed project-level in `.claude/skills/`
(`npx skills add <repo> --skill <name> -a claude-code --copy`), pinned by hash in
`skills-lock.json`. Each was reviewed before use: Markdown only, no scripts.

### Ecosystem exploration

| Search | Top relevant result | Decision |
|---|---|---|
| `npx skills find "core web vitals"` | `addyosmani/web-quality-skills@core-web-vitals` | **Applied.** The Vercel skill is Next-centric and has no layout-shift rule; a measured CLS of 0.061 was open |
| `npx skills find performance` | `addyosmani/web-quality-skills@performance` | Not installed; `core-web-vitals` covered the open issue |
| `npx skills find testing` | `anthropics/skills@webapp-testing` | Not installed; component tests need jsdom and Testing Library, which the rules say to ask about first |

### Verified changes

Measured on the production build (`vite preview`, Lighthouse median of 3) and in
the browser with the internal skill's scripts.

| Area | Before | After |
|---|---|---|
| Chart accessible names (focusable SVGs) | Empty | "Income vs. outcome by month", "Profit margin by month" |
| Chart text alternative | None | Visually hidden data table per chart (13 rows) |
| Chart axis contrast | 3.14:1 (fails AA) | 5.18:1 |
| Heading outline | `h1` only | `h1` → 2 × `h2` → 2 × `h3` |
| Skeleton under reduced motion | `pulse` | `none` |
| Load error | Spanish, not announced | English, `role="alert"` |
| Build | 585.9 kB chunk, >500 kB warning | 187.9 kB main chunk, no warning |
| First paint without JS | Light `oklch(0.97)` | Dark `oklch(0.13)` |
| SEO | 82 | 91 (meta description) |
| CLS | 0.061 | 0.000 (mobile and desktop) |
| Observed FCP / LCP | 91 / 155 ms | 59 / 89 ms |
| Simulated LCP (slow 4G) | 2.28 s | 2.43 s — worse: Lantern penalizes the extra chunk requests |
| Lighthouse accessibility | 100 | 100 (it missed the contrast and naming issues above) |

Next.js-only items from the Vercel brief (`next/image`, the metadata API) have no
direct equivalent: the app renders no images, and metadata went into
`index.html`. `bundle-barrel-imports` was checked and not applied: only the 5
used lucide icons reach the bundle.

### Internal skill

`.skills/ui-quality-gate/` fills a gap `verify-changes` leaves: nothing measured
accessibility, layout shift or loading. It records the repo traps found here
(dev-server numbers, simulated vs observed LCP, `--color-*` vs raw tokens,
skeleton sizes, `sr-only` on tables). A regression drill confirmed it catches a
real defect: with a chart's `title` removed, its tab stop reported an empty name.

### Quality baseline

Numbers for the next run of `ui-quality-gate` to compare against (2026-11-14,
commit `b33a7fb`):

| Metric | Value |
|---|---|
| Lighthouse performance / a11y / best practices / SEO | 98 / 100 / 100 / 91 |
| CLS (Lighthouse and observer, both viewports) | 0.000 |
| Observed FCP / LCP | 59 / 89 ms |
| Simulated FCP / LCP | 1361 / 2428 ms |
| Main JS chunk | 187.9 kB (59.8 kB gzip) |
| Minimum text contrast | 5.18:1 |

### Left open

- `robots.txt` missing (Lighthouse `robots-txt`).
- Simulated LCP is 150 ms above the original; the observed LCP improved.
- No component tests, so the a11y fixes are guarded by `ui-quality-gate`, not
  by CI.
