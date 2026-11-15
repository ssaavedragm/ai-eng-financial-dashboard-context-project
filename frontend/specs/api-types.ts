/**
 * Response types for the three dashboard features in `frontend/specs/`.
 *
 * Every interface mirrors a schema in the backend's OpenAPI document
 * (http://localhost:8000/openapi.json, rendered at /docs). Property names are
 * the API's own `snake_case` names. Verified against the running API on
 * 2026-11-14.
 *
 * The literal unions `OperationType`, `Category` and `BusinessType` are not
 * redefined here: they are re-exported from `src/lib/financial-types.ts`, so
 * the app and these specs share one copy.
 */

import type {
  BusinessType,
  Category,
  OperationType,
} from "../src/lib/financial-types";

export type { BusinessType, Category, OperationType };

/**
 * A calendar date as the API sends and accepts it: `YYYY-MM-DD`, with no time
 * and no timezone (OpenAPI `"format": "date"`).
 *
 * Compare two values as strings. Do not parse with `new Date(value)`: that
 * reads UTC midnight, and local getters return the previous day behind UTC.
 */
export type IsoDate = string;

/**
 * Response of `GET /api/metrics/facets` (OpenAPI schema `MetricsFacets`).
 *
 * Describes the whole dataset. The endpoint takes no query parameters and
 * ignores any that are sent, so the values never change with a date filter.
 * Same shape as `MetricsFacets` in `src/lib/financial-types.ts`.
 *
 * Used by feature 1 (available-range hint) and feature 3 (same hint, shared
 * filter). Feature 3 does not use `categories`: see `README.md`.
 */
export interface FacetsResponse {
  /**
   * Operation types present in the data, sorted alphabetically.
   * Values: `"income"`, `"outcome"`.
   */
  operation_types: OperationType[];
  /**
   * Business lines present in the data, sorted alphabetically.
   * Values: `"B2B"`, `"B2C"`.
   */
  business_types: BusinessType[];
  /**
   * Every category present in the data, income and outcome together, sorted
   * alphabetically. Values: `"administrative"`, `"operational"`, `"others"`,
   * `"sales"`, `"suppliers"`. Not filtered by business line.
   */
  categories: Category[];
  /**
   * Date of the earliest movement in the dataset. Format: `YYYY-MM-DD`.
   * Moves with today's date: it falls in the month 12 months before the
   * current one, on a day from 1 to 28.
   */
  min_date: IsoDate;
  /**
   * Date of the latest movement in the dataset. Format: `YYYY-MM-DD`.
   * Not necessarily the end of a month: generated days run from 1 to 28.
   */
  max_date: IsoDate;
}

/**
 * One row of `GET /api/metrics/alerts` (OpenAPI schema `MetricsAlert`).
 *
 * A period is an alert when
 * `(outcome_total - baseline_average) / baseline_average > threshold`
 * (strictly greater). Used by feature 2, the anomaly table.
 */
export interface AlertEntry {
  /**
   * The period the alert is for. Format depends on `group_by`:
   * `YYYY-MM` for `month` (the default, and what feature 2 uses),
   * `YYYY-Www` for `week` (ISO week, e.g. `2026-W07`), `YYYY-MM-DD` for `day`.
   */
  period: string;
  /**
   * Total outcome (spending) in the period, in USD, rounded to 2 decimals.
   * Always greater than 0 for an alert.
   */
  outcome_total: number;
  /**
   * Mean outcome of **all** earlier periods inside the requested date range,
   * in USD, rounded to 2 decimals. Not a 3-period moving average. Always
   * greater than 0: periods with a zero baseline are never alerts.
   */
  baseline_average: number;
  /**
   * `(outcome_total - baseline_average) / baseline_average`, rounded to 4
   * decimals. A ratio, not a percentage: `0.397` means 39.7 %. Always greater
   * than the requested `threshold`.
   */
  increase_ratio: number;
}

/**
 * Response of `GET /api/metrics/alerts`: alerts ordered by `period`,
 * ascending. Empty when no period exceeds the threshold, and always empty
 * when the range covers a single period.
 */
export type AlertsResponse = AlertEntry[];

/**
 * One row of `GET /api/metrics/categories/top` (OpenAPI schema
 * `TopCategoryItem`). Used by feature 3, one table per business line.
 */
export interface CategoryEntry {
  /**
   * The category. Values: `"suppliers"`, `"sales"`, `"operational"`,
   * `"administrative"`, `"others"`. With `operation_type=income`, the current
   * data only produces `"sales"` and `"others"`.
   */
  category: Category;
  /**
   * Echoes the requested `operation_type`. Values: `"income"`, `"outcome"`.
   * Always `"income"` in feature 3.
   */
  operation_type: OperationType;
  /**
   * Sum of the category's movement amounts in the requested range and
   * business line, in USD, rounded to 2 decimals. Greater than 0.
   */
  total_amount: number;
}

/**
 * Response of `GET /api/metrics/categories/top`: at most `limit` rows,
 * ordered by `total_amount`, descending. Empty when nothing matches.
 */
export type TopCategoriesResponse = CategoryEntry[];
