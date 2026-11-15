# Component specs

Components for the three features. Props use the types in
[api-types.ts](api-types.ts) and [param-types.ts](param-types.ts). The data
contract (endpoints, constraints, edge cases) is in [README.md](README.md).

## Conventions for every component

- **Location:** components go in `frontend/src/components/dashboard/`, one per
  file, in kebab-case files with a PascalCase named export, as in
  `kpi-row.tsx` → `KPIRow`.
- **Data fetching:** `App.tsx` does all fetching and owns all state, as it does
  today. Components only render props and report user input through callbacks.
- **Calculations:** formatting and math go in `src/lib/financial-utils.ts` as
  pure functions. Components call them; they do not inline the math.
- **Derived types:** types the frontend derives, not the API, use `camelCase`
  and go in `src/lib/financial-types.ts` (`.agents/rules/api-contract.md`).
- **Three states:** components that show API data take `loading: boolean` and
  render loading (a `Skeleton` with the loaded layout), empty (an explicit
  message) and data. The rule is in `.agents/rules/frontend.md`.
- **Styling:** use `Card` from `src/components/ui/card.tsx`, theme tokens such as
  `bg-card`, `text-muted-foreground` and `border-border`, and the series color
  `var(--chart-income)`. No literal colors.
- **Text:** the UI is in English. Strings in quotes below are literal.
- **Formatting:** money uses `formatCurrency`, which gives whole USD
  (`$557,904`). Percentages use `formatPercent`, which gives 1 decimal
  (`39.7%`).

## Page layout

```text
<main>
  DashboardHeader              existing; still shows the full dataset period
  ViewTabs                     feature 3: "Overview" | "B2B vs B2C"
  DateRangeControls            feature 1: shared by both tabs
  ── view = "overview" ─────────────────────────────────────────
  KPIRow                       existing, now filtered by date
  IncomeOutcomeChart | ProfitPercentChart   existing, filtered by date
  AnomalyAlertsPanel           feature 2
  ── view = "business-comparison" ──────────────────────────────
  BusinessCategoryTable (B2B) | BusinessCategoryTable (B2C)
  BusinessIncomeChart          full width
```

The two-column rows use `grid grid-cols-1 gap-4 xl:grid-cols-2`, like the
existing chart row, so they stack below the `xl` breakpoint.

## State owned by `App.tsx`

```ts
const [view, setView] = useState<DashboardView>("overview");
const [dateRange, setDateRange] = useState<DateRangeFilter>({});
const [thresholdInput, setThresholdInput] = useState<string>("0.3");
```

`DashboardView` is a derived type: `type DashboardView = "overview" | "business-comparison"`.

---

## Feature 1: Date range filter

### `DateRangeControls` (`date-range-controls.tsx`)

The name is not `DateRangeFilter`, because that is the query type.

```ts
interface DateRangeControlsProps {
  /** Current range. A missing key means that input is empty. */
  value: DateRangeFilter;
  /** Called with the whole new range on every change. Empty inputs are left out, never "". */
  onChange: (next: DateRangeFilter) => void;
  /** min_date and max_date from FacetsResponse. undefined while loading or if /facets failed. */
  availableRange?: Pick<FacetsResponse, "min_date" | "max_date">;
}
```

**Layout:** one row that wraps on narrow screens:

```text
[Start date ▾]  [End date ▾]  [Clear]     Available data: 2025-11-01 – 2026-10-28
Start date must be on or before end date.          ← only when invalid
```

- **Inputs:** two `<input type="date">`, each with a visible `<label>`:
  "Start date" and "End date". An input's value is `value.start_date ?? ""`.
  On change, an empty string removes the key, using
  `toDateRangeFilter(start, end)` from `src/lib/`.
- **"Clear" button:** calls `onChange({})`. Only rendered when at least one key
  is set.

**Only one input filled:** that is a valid, open-ended range. Only the filled
key is sent:

| Filled | Query sent | Data shown |
|---|---|---|
| Neither | none | Whole dataset |
| Start only | `start_date=…` | From that day to `max_date` |
| End only | `end_date=…` | From `min_date` to that day |
| Both | both | That range, both ends inclusive |

No validation message appears while only one input is filled.

**Invalid range:** when both keys are set and `start_date > end_date` (string
comparison), show "Start date must be on or before end date." in an element
with `role="alert"`. `App` checks the same condition with
`isValidDateRange(value)` from `src/lib/` and makes no requests while it is
false.

**Available-range hint from `FacetsResponse`:**

- Text: "Available data: {min_date} – {max_date}", with both dates exactly as
  the API sends them (`YYYY-MM-DD`), the same format the inputs use. Use an en
  dash with a space on each side.
- Style: `text-xs text-muted-foreground`.
- Both inputs get `min={min_date}` and `max={max_date}`. Those attributes only
  limit the browser's picker; a typed date outside them is still sent, and the
  API returns an empty list.
- While `availableRange` is `undefined` (still loading, or `/facets` failed),
  render no hint and no `min`/`max`. The inputs keep working. There is no
  skeleton, because the hint is decorative and must not block the page.

---

## Feature 2: Anomaly alerts table

### `AnomalyAlertsPanel` (`anomaly-alerts-panel.tsx`)

The whole feature is one `Card` titled "Spending anomalies", in its own
`<section aria-label="Spending anomalies">` below the chart row. It contains
the threshold input and the table.

```ts
interface AnomalyAlertsPanelProps {
  /** Rows from the last successful request with a valid threshold. */
  alerts: AlertsResponse;
  /** The threshold that produced `alerts`, for the empty-state message. */
  appliedThreshold: AlertsParams["threshold"];
  /** True while a request is in flight. */
  loading: boolean;
  /** Message for a failed request, or null. Only this panel shows it. */
  error: string | null;
  /** Raw text of the threshold input, exactly as typed. */
  thresholdInput: string;
  /** Called with the raw text on every keystroke. */
  onThresholdInputChange: (raw: string) => void;
  /** True when `start_date` or `end_date` is set. */
  dateFilterActive: boolean;
}
```

**Threshold input:**

- `<input type="number" min="0.01" max="1" step="0.01" inputMode="decimal">`
  with the label "Alert threshold (ratio)". It starts at `"0.3"`.
- Help text next to it, from the applied threshold: "Alert when spending is more
  than {formatPercent(appliedThreshold * 100)} above baseline".
- **Valid value:** `isValidThreshold(raw)` from `src/lib/` returns true when
  `raw` parses to a finite number from `0.01` to `1` inclusive. Any number of
  decimals is accepted; `step` only drives the spinner arrows.
- **Requests:** `App` waits 300 ms after the last valid keystroke, then fetches
  with `threshold: Number(thresholdInput)` and cancels any earlier request.

**Out-of-range threshold** (empty, not a number, below `0.01` or above `1`):

- No request is sent.
- The input gets `aria-invalid="true"`, and "Enter a value between 0.01 and 1.0."
  appears below it with `role="alert"`.
- The table keeps showing the last valid result (`alerts` and
  `appliedThreshold` do not change), so the page does not jump while the user
  types.

**Columns**, in this order:

| Header | Source field | API type | Rendered as |
|---|---|---|---|
| "Period" | `period` | `string`, `YYYY-MM` | `formatMonthYearLabel(period)` → `"Dec 2025"` |
| "Outcome" | `outcome_total` | `number`, USD | `formatCurrency` → `"$103,379"` |
| "Baseline (avg. of prior periods)" | `baseline_average` | `number`, USD | `formatCurrency` → `"$41,404"` |
| "Increase" | `increase_ratio` | `number`, ratio | `formatPercent(increase_ratio * 100)` → `"149.7%"` |

- `formatMonthYearLabel` already exists in `financial-utils.ts` but is not
  exported; export it. It works on the `YYYY-MM` string, with no UTC parsing.
- Use a semantic `<table>` with `<th scope="col">`. Align the three numeric
  columns to the right.
- Rows keep the API order, oldest period first.

**States:**

| State | Renders |
|---|---|
| `loading` | Title and input stay; the table area shows a `Skeleton` header and 3 row skeletons |
| `error` set | Title and input stay; "Could not load spending anomalies." instead of the table |
| `alerts` is `[]` | Title, input and column headers stay; one full-width row reads "No spending anomalies above {formatPercent(appliedThreshold * 100)} for this period." The panel never disappears |
| Rows | The table |

When `dateFilterActive` is true, add this line below the table in
`text-xs text-muted-foreground`: "Baselines only use periods inside the selected
date range."

---

## Feature 3: B2B vs B2C comparison view

### `ViewTabs` (`view-tabs.tsx`)

```ts
interface ViewTabsProps {
  /** The active view. */
  view: DashboardView;
  /** Called when the user picks a tab. */
  onViewChange: (view: DashboardView) => void;
}
```

Two buttons in a `role="tablist"`: "Overview" (`"overview"`) and "B2B vs B2C"
(`"business-comparison"`). Each has `role="tab"` and `aria-selected`. There is
no router and no URL change; the view resets to "Overview" on reload.

### `BusinessComparisonView` (`business-comparison-view.tsx`)

The two-panel layout. It renders two `BusinessCategoryTable` side by side, B2B
on the left, and `BusinessIncomeChart` below at full width.

```ts
interface BusinessComparisonViewProps {
  /** Response for business_type=B2B. */
  b2b: TopCategoriesResponse;
  /** Response for business_type=B2C. */
  b2c: TopCategoriesResponse;
  /** True while either request is in flight. */
  loading: boolean;
  /** Message if either request failed, or null. */
  error: string | null;
}
```

- It builds the chart data with
  `computeBusinessIncomeTotals(b2b, b2c): BusinessIncomeTotal[]` from `src/lib/`.
- `App` fetches both lists with `Promise.all`, so they always come from the same
  date range. If either request fails, `error` is set and the view shows only
  "Could not load B2B vs B2C comparison." in a `Card`. No partial data is shown.

### `BusinessCategoryTable` (`business-category-table.tsx`)

The top-5 table for one business line.

```ts
interface BusinessCategoryTableProps {
  /** Which line this table is for; drives the title. */
  businessType: TopCategoriesParams["business_type"];
  /** The categories/top response for that line. */
  categories: TopCategoriesResponse;
  /** True while loading. */
  loading: boolean;
}
```

- `Card` titled "B2B income by category" or "B2C income by category".
- Rows come from `computeCategoryShares(categories)` in `src/lib/`, which
  returns `{ rows: CategoryShare[]; groupTotal: number }`. `CategoryShare` is
  `{ category: Category; totalAmount: number; sharePercent: number }`, with
  `sharePercent` from 0 to 100, and it keeps the API's descending order.
- `groupTotal` is the sum of `total_amount`. That is the group's whole income:
  `limit=5` equals the number of categories, so nothing is cut off.

| Header | Source | Rendered as |
|---|---|---|
| "Category" | `category` | First letter upper-case: `"sales"` → `"Sales"` |
| "Income" | `totalAmount` | `formatCurrency` |
| "Share of total" | `sharePercent` | `formatPercent` |

- A last row, "Total", shows `formatCurrency(groupTotal)` and `"100.0%"`.
- Expect 1 or 2 rows with today's data (`Sales`, `Others`). Do not pad the table
  to 5.

**Empty top-5 list** (`categories` is `[]`: no income for that line in the
range): keep the card and its title, and replace the table with "No income for
this period." Do not compute shares, so nothing is divided by zero. The other
panel renders independently.

**Loading:** a `Skeleton` table with a header and 2 rows.

### `BusinessIncomeChart` (`business-income-chart.tsx`)

```ts
interface BusinessIncomeChartProps {
  /** Always two points, B2B first, then B2C. */
  data: BusinessIncomeTotal[];
  /** True while loading. */
  loading: boolean;
}
```

`BusinessIncomeTotal` is a derived type:
`{ businessType: BusinessType; totalIncome: number }`.

**What it shows:** a Recharts vertical bar chart in a `Card` titled "Total
income: B2B vs B2C".

- **The two data points:** `totalIncome` for `"B2B"` and for `"B2C"`. Each is the
  sum of `total_amount` in that line's `categories/top` response, which is the
  line's total income in the selected date range. It is the same number as that
  table's "Total" row.
- X axis: the business line (`"B2B"`, `"B2C"`). Y axis: amount, with ticks from
  `formatCurrency`.
- Both bars use `var(--chart-income)`: they are the same metric, and
  `frontend.md` keeps one color per metric. The axis label tells them apart.
- Tooltip: business line and `formatCurrency(totalIncome)`.

**States:**

| State | Renders |
|---|---|
| `loading` | `Skeleton` with the chart's height |
| Both totals are 0 | "No data available to display", the same message as the existing charts |
| One total is 0 | Both bars; the empty one has height 0, and its tooltip shows `$0` |
| Both above 0 | Both bars |

---

## Decisions this spec makes where the PM brief was open

| Question | Decision |
|---|---|
| Does the header period change with the filter? | No. It keeps showing the full dataset range from `/facets` |
| Is the date range shared between tabs? | Yes. One `dateRange` state in `App` |
| What happens with `start_date > end_date`? | Validation message; no requests |
| Requests on every threshold keystroke? | No. 300 ms debounce, and only for valid values |
| What does the table show while the threshold is invalid? | The last valid result |
| "3-period moving average" column | Labelled "Baseline (avg. of prior periods)", because that is what the API returns. Needs PM confirmation |
| "New page" without a router | A tab inside `App`, with no URL. A deep link would need a router dependency: ask first |
| Where do the per-group categories come from? | `categories/top`, not `facets.categories`, which mixes in outcome-only categories |
| One request failed in the B2B vs B2C view | View-level error; no partial data |
