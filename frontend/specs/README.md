# Data contract: date filter, anomaly alerts, B2B vs B2C

The API contract for three dashboard features. With this folder you can build
them without asking anything else.

| File | Contents |
|---|---|
| `README.md` (this file) | Endpoints, request and response types, parameter constraints, edge cases |
| [api-types.ts](api-types.ts) | Response types, with JSDoc on every property |
| [param-types.ts](param-types.ts) | Query parameter types, with JSDoc on every property |
| [components.md](components.md) | Components, props, layout, UI states |
| [tsconfig.json](tsconfig.json) | Strict type check for this folder |

The reasoning behind the decisions (what the PM asked for and why the spec
differs) is in `docs/specs/`, in Spanish. Where the two disagree, this folder
wins.

**Source of truth:** the running API, http://localhost:8000/docs and
`/openapi.json`. Every path, parameter, field and edge case here was checked
against it on 2026-11-14.

## Before you start

- **Run commands in Docker** from the repo root (`.agents/rules/workflow.md`).
  Start with `docker compose up --build -d`.
- **No backend changes.** All three features use endpoints and parameters that
  already exist. Do not edit `backend/`.
- **Build order:** 1 → 2 → 3. Features 2 and 3 reuse the date range state from
  feature 1.
- **Importing the types:** import them from this folder; do not copy them. From
  `frontend/src/App.tsx`:

  ```ts
  import { type AlertsResponse, type FacetsResponse } from "../specs/api-types";
  import { type AlertsParams, type DateRangeFilter } from "../specs/param-types";
  ```

  The `@/` alias only covers `src/`, so use the relative path. `FinancialMovement`
  (feature 1's response) is not repeated here; it is already in
  `src/lib/financial-types.ts`, and it matches the API.
- **Checking the types:** `npx tsc --noEmit -p specs`, run in `frontend/`. A
  plain `npx tsc --noEmit` checks nothing, because `frontend/tsconfig.json` only
  holds references (`"files": []`). `npm run build` runs `tsc -b`, which covers
  this folder too.

## Rules for every request

These apply to all three features.

1. **Base URL.** Build every URL from
   `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""`, as `App.tsx`
   does. Never hardcode a host or port.
2. **Function per endpoint.** Follow the pattern in `App.tsx`: a module-level
   `async` function that calls `fetch`. On `!response.ok`, it throws
   `new Error(\`Failed to fetch <what>: ${response.status}\`)`; otherwise it
   returns `response.json()`. Add a `signal?: AbortSignal` argument and pass it
   to `fetch`.
3. **Query string.** Build it with `URLSearchParams` from a params object of the
   types in `param-types.ts`. Only append keys that are defined. Numbers become
   strings with `String(value)`.
4. **Cancellation.** Each `useEffect` that fetches creates an `AbortController`
   and aborts it in its cleanup. Ignore errors whose `name` is `"AbortError"`.
5. **No invalid requests.** Validate in the UI first. The UI must never cause a
   `422`. If a `422` happens anyway, treat it like any other failed request.

**Response codes:**

| Code | When | Body |
|---|---|---|
| `200` | Valid request, including one with no matching data | JSON as typed below; lists may be `[]` |
| `422` | A parameter has the wrong type, an unknown enum value, or is out of range | `{ "detail": [{ "loc": ["query", "<name>"], "msg": "...", "type": "..." }] }` |

**Two traps the API sets** (checked):

- **Unknown parameters are silently ignored.** A misspelled key, such as
  `startDate` instead of `start_date`, gets `200` with unfiltered data. Use the
  types in `param-types.ts`, whose keys are the exact API names.
- **Inverted ranges are not rejected.** With `start_date` after `end_date`, list
  endpoints return `200 []`. The UI catches this before sending.

**Dates:** always `YYYY-MM-DD` strings, the native value of
`<input type="date">`. Ranges include both ends. Compare dates as strings; never
parse them with `new Date("YYYY-MM-DD")`, which reads UTC midnight and shifts the
day behind UTC. The dataset covers the 12 full months before the current one and
moves with today's date, so never hardcode dates in code or tests.

---

## Feature 1: Date range filter

Two optional date inputs that filter everything on the Overview tab (KPIs and
both charts). A hint shows the dataset's available range.

### `GET /api/metrics/facets`: available range

| | |
|---|---|
| **Request** | No parameters. It ignores any you send |
| **Response type** | `FacetsResponse` (`api-types.ts`) |
| **When** | Once, on mount. `App.tsx` already does this for the header; reuse that response |
| **Fields used** | `min_date`, `max_date` |

```json
{ "operation_types": ["income", "outcome"], "business_types": ["B2B", "B2C"],
  "categories": ["administrative", "operational", "others", "sales", "suppliers"],
  "min_date": "2025-11-01", "max_date": "2026-10-28" }
```

### `GET /api/metrics`: filtered movements

| | |
|---|---|
| **Request type** | `DateRangeFilter` (`param-types.ts`) |
| **Response type** | `FinancialMovement[]` (`src/lib/financial-types.ts`), chronological |
| **When** | On mount, and whenever the date range changes and is valid |

| Parameter | Type | Required | Valid values | Feature 1 sends |
|---|---|---|---|---|
| `start_date` | `YYYY-MM-DD` | No | Any valid date; omitted means no lower bound | When the start input is filled |
| `end_date` | `YYYY-MM-DD` | No | Any valid date; omitted means no upper bound | When the end input is filled |
| `category` | enum | No | `suppliers`, `sales`, `operational`, `administrative`, `others` | Never |
| `operation_type` | enum | No | `income`, `outcome` | Never |

The response feeds the existing `computeKPIs` and `computeMonthlyData`, unchanged.

### Edge cases

| Case | API behavior (checked) | UI must show |
|---|---|---|
| Only one input filled | Open-ended range: on 2026-11-14, `start_date=2026-03-01` alone gave 240 rows and `end_date=2026-03-31` alone gave 150 | Data for the open range; no validation message |
| Start after end | `200 []` | "Start date must be on or before end date."; no request is sent |
| Range with no data (e.g. a future year) | `200 []` | KPIs at `$0` and `0.0%`; both charts show "No data available to display" |
| `/facets` fails | — | No hint and no `min`/`max` on the inputs; the filter keeps working |
| `/api/metrics` fails | — | The existing page error in `App.tsx` |

---

## Feature 2: Anomaly alerts table

A table below the charts on the Overview tab, listing periods where spending
rose above the baseline by more than a user-set threshold.

### `GET /api/metrics/alerts`

| | |
|---|---|
| **Request type** | `AlertsParams` (`param-types.ts`) |
| **Response type** | `AlertsResponse`, which is `AlertEntry[]` (`api-types.ts`), oldest period first |
| **When** | On mount, and after a valid threshold or date range change (300 ms debounce for the threshold) |

| Parameter | Type | Required | Valid values (API) | Feature 2 sends |
|---|---|---|---|---|
| `threshold` | number | No (default `0.3`) | `>= 0`, no maximum; negatives and non-numbers get `422` | Always; only values from `0.01` to `1.0` |
| `start_date` | `YYYY-MM-DD` | No | Any valid date | From the shared date range |
| `end_date` | `YYYY-MM-DD` | No | Any valid date | From the shared date range |
| `group_by` | enum | No (default `month`) | `day`, `week`, `month` | Never; the default gives `YYYY-MM` periods |
| `business_type` | enum | No | `B2B`, `B2C` | Never |

```json
[{ "period": "2025-12", "outcome_total": 103378.98,
   "baseline_average": 41404.44, "increase_ratio": 1.4968 }]
```

**How the API decides:** a period is an alert when
`(outcome_total - baseline_average) / baseline_average > threshold`, strictly
greater. `baseline_average` is the mean outcome of **all** earlier periods inside
the requested range. It is not a 3-period moving average, which is what the PM
asked for. The column is labelled "Baseline (avg. of prior periods)" to match the
data, and this still needs PM confirmation. `increase_ratio` is a ratio:
display `increase_ratio * 100` as a percentage.

### Edge cases

| Case | API behavior (checked) | UI must show |
|---|---|---|
| No period exceeds the threshold | `200 []` (e.g. `threshold=1.5`) | The panel stays, with its column headers and "No spending anomalies above {N}% for this period." |
| Threshold empty, not a number, below `0.01` or above `1` | Not sent. The API would accept `1.5` (`200 []`) and reject `-0.1` and `abc` (`422`) | "Enter a value between 0.01 and 1.0."; the last valid rows stay; no request |
| Range covering a single month | Always `200 []`: the first period has no baseline | The empty-state message, plus "Baselines only use periods inside the selected date range." |
| Range starting mid-month | That month counts with partial spending and lowers the baseline: Feb 1–Apr 30 gives 1 alert, Feb 15–Apr 30 gives 2 | Rows as returned, plus the same baseline note |
| Request fails | — | "Could not load spending anomalies." inside the panel; KPIs and charts unaffected |

---

## Feature 3: B2B vs B2C comparison view

A second tab, "B2B vs B2C". It has one income-by-category table per business
line, side by side, and below them a bar chart of each line's total income.

### `GET /api/metrics/categories/top`, called twice

| | |
|---|---|
| **Request type** | `TopCategoriesParams` (`param-types.ts`) |
| **Response type** | `TopCategoriesResponse`, which is `CategoryEntry[]` (`api-types.ts`), by `total_amount` descending |
| **When** | When the tab is active, on entering it and on every valid date range change. Fetch both lines with `Promise.all` |

| Parameter | Type | Required | Valid values (API) | Feature 3 sends |
|---|---|---|---|---|
| `operation_type` | enum | No (default **`outcome`**) | `income`, `outcome` | Always `income`; never rely on the default |
| `limit` | integer | No (default `5`) | `1` to `20`; outside, `422` | Always `5` |
| `business_type` | enum | No (omitted ranks both lines together) | `B2B`, `B2C`; case-sensitive, `b2b` gets `422` | `B2B` in one call, `B2C` in the other |
| `start_date` | `YYYY-MM-DD` | No | Any valid date | From the shared date range |
| `end_date` | `YYYY-MM-DD` | No | Any valid date | From the shared date range |

There is no `category` parameter: the API ignores it.

```json
[{ "category": "sales", "operation_type": "income", "total_amount": 557903.97 },
 { "category": "others", "operation_type": "income", "total_amount": 57636.75 }]
```

**Derived values** (pure helpers in `src/lib/`; see `components.md`):

- **Group total** is the sum of `total_amount`. That is the line's whole income,
  because `limit=5` equals the number of categories, so nothing is cut off.
  Checked for B2B: 615540.72 from the rows, from `/api/metrics/b2b` and from
  `/api/metrics/summary`.
- **Share** of a row is `total_amount / group total * 100`.
- **Chart points:** the two group totals, B2B then B2C.

### Endpoints not to use

| Endpoint | Why not |
|---|---|
| `/api/metrics/facets` → `categories` | Not filtered by business line, and it includes outcome-only categories. Rows come only from `categories/top` |
| `/api/metrics/comparison` | It compares net profit with the previous period, not B2B with B2C |
| `/api/metrics/b2b`, `/api/metrics/b2c` | They return raw movements; the sums are already in `categories/top` |

Feature 3 uses `/facets` only for the date range hint, through feature 1's
controls.

### Edge cases

| Case | API behavior (checked) | UI must show |
|---|---|---|
| Fewer than 5 rows | Income only uses `sales` and `others`, so each line has at most 2 rows | Only the returned rows plus "Total"; no padding |
| One line has no income in the range | `200 []` for that call | That panel: title plus "No income for this period."; its chart bar is 0; the other panel is normal |
| Both lines empty | `200 []` twice (e.g. `start_date=2030-01-01`) | Both panels empty; the chart shows "No data available to display" |
| Either request fails | — | Only "Could not load B2B vs B2C comparison."; no partial data |
| Start after end | Would be `200 []` | Feature 1's validation message; no requests |

---

## Done when

- `npx tsc --noEmit -p specs`, `npm test`, `npm run lint` and `npm run build`
  pass in the frontend container, and `npm test` also passes with
  `TZ=America/Santiago`. Use the `verify-changes` skill.
- Each edge case above was tried in the running app, or the report says it was
  not.
- `memory-bank/current-state.md` lists the newly wired endpoints
  (`categories/top` and `alerts`), and `.agents/rules/api-contract.md` lists the
  new types (`.agents/rules/workflow.md`, "Keep the docs true").
