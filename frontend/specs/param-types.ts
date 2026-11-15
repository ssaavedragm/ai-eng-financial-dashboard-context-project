/**
 * Query parameter types for the three dashboard features in `frontend/specs/`.
 *
 * Keys are the API's own query parameter names, so an object of these types
 * maps one to one onto `URLSearchParams`. Verified against the `parameters`
 * of each path in http://localhost:8000/openapi.json on 2026-11-14.
 *
 * The API silently ignores query parameters it does not declare, so a
 * misspelled key returns unfiltered data instead of an error. These types are
 * what prevents that.
 */

import type { BusinessType, OperationType } from "./api-types";

/**
 * Optional date range, accepted by `GET /api/metrics`,
 * `GET /api/metrics/alerts` and `GET /api/metrics/categories/top`.
 *
 * Both ends are inclusive. Leave a key out when its input is empty: an empty
 * or malformed value gets a `422`. When both are set, `start_date` must be on
 * or before `end_date`. The API does not check this and returns `200` with an
 * empty list, so the UI checks it before sending.
 */
export interface DateRangeFilter {
  /**
   * First day to include. Format: `YYYY-MM-DD`. Omitted: no lower bound.
   */
  start_date?: string;
  /**
   * Last day to include. Format: `YYYY-MM-DD`. Omitted: no upper bound.
   */
  end_date?: string;
}

/**
 * Query for `GET /api/metrics/alerts` as feature 2 sends it.
 *
 * The endpoint also accepts `group_by` (`"day" | "week" | "month"`, default
 * `"month"`) and `business_type`. Feature 2 sends neither, so they are left
 * out here on purpose.
 */
export interface AlertsParams extends DateRangeFilter {
  /**
   * Minimum `increase_ratio` for a period to count as an alert (strictly
   * greater). A ratio, not a percentage: `0.3` means 30 %.
   * API: any number `>= 0`, default `0.3`; negatives and non-numbers get a
   * `422`. Feature 2 only sends values from `0.01` to `1.0`.
   */
  threshold: number;
}

/**
 * Query for `GET /api/metrics/categories/top` as feature 3 sends it, once per
 * business line.
 */
export interface TopCategoriesParams extends DateRangeFilter {
  /**
   * Which movements to rank. Values: `"income"`, `"outcome"`.
   * API default: `"outcome"`, so always send it. Feature 3 sends `"income"`.
   */
  operation_type: OperationType;
  /**
   * Maximum number of rows. Integer from 1 to 20; outside that range, `422`.
   * API default: `5`. Feature 3 sends `5`.
   */
  limit: number;
  /**
   * Business line to rank. Values: `"B2B"`, `"B2C"`, case-sensitive
   * (`"b2b"` gets a `422`). Optional in the API, where leaving it out ranks
   * both lines together. Required here because feature 3 always sends it.
   */
  business_type: BusinessType;
}
