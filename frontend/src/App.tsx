import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KPIRow } from "@/components/dashboard/kpi-row";
import { IncomeOutcomeChart } from "@/components/dashboard/income-outcome-chart";
import { ProfitPercentChart } from "@/components/dashboard/profit-percent-chart";
import {
  type FinancialMovement,
  type KPIMetrics,
  type MetricsFacets,
  type MonthlyDataPoint,
} from "@/lib/financial-types";
import {
  computeKPIs,
  computeMonthlyData,
  formatPeriodRange,
} from "@/lib/financial-utils";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function fetchFinancialData(): Promise<FinancialMovement[]> {
  const response = await fetch(`${API_BASE_URL}/api/metrics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch financial data: ${response.status}`);
  }
  return response.json();
}

async function fetchMetricsFacets(): Promise<MetricsFacets> {
  const response = await fetch(`${API_BASE_URL}/api/metrics/facets`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics facets: ${response.status}`);
  }
  return response.json();
}

function App() {
  const [metrics, setMetrics] = useState<KPIMetrics | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyDataPoint[]>([]);
  const [period, setPeriod] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFinancialData()
      .then((movements) => {
        setMetrics(computeKPIs(movements));
        setMonthlyData(computeMonthlyData(movements));
      })
      .catch(() => {
        // English to match <html lang="en"> (WCAG 3.1.2, language of parts).
        setError("Could not load financial data. Check the backend API.");
      })
      .finally(() => {
        setLoading(false);
      });

    // The label is optional: if this fails, the header simply omits it.
    fetchMetricsFacets()
      .then((facets) => {
        setPeriod(formatPeriodRange(facets.min_date, facets.max_date));
      })
      .catch(() => {
        setPeriod(undefined);
      });
  }, []);

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8">
          <DashboardHeader period={period} />

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground"
            >
              {error}
            </div>
          ) : null}

          <section aria-labelledby="kpi-heading" aria-busy={loading}>
            <h2 id="kpi-heading" className="sr-only">
              Key performance indicators
            </h2>
            <KPIRow metrics={metrics} loading={loading} />
          </section>

          <section aria-labelledby="charts-heading" aria-busy={loading}>
            <h2 id="charts-heading" className="sr-only">
              Financial charts
            </h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <IncomeOutcomeChart data={monthlyData} loading={loading} />
              <ProfitPercentChart data={monthlyData} loading={loading} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default App;
