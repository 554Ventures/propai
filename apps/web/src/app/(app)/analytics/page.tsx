"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
};

type ForecastPoint = {
  period: string;
  income: number;
  expenses: number;
  net: number;
};

type ForecastResponse = {
  propertyId: string;
  granularity: "monthly" | "annual";
  history: ForecastPoint[];
  projection: ForecastPoint[];
  confidence: number;
};

type Insight = {
  id: string;
  type: string;
  confidence: number | null;
  reasoning: string | null;
  output: Record<string, unknown> | null;
  createdAt: string;
};

type InsightResponse = {
  items: Insight[];
  metrics: {
    expenseCategorizationAccuracy: number | null;
    sampleSize: number;
  };
};

export default function AnalyticsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"monthly" | "annual">("monthly");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [insights, setInsights] = useState<InsightResponse | null>(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      setLoadingProperties(true);
      try {
        const data = await apiFetch<Property[]>("/properties", { auth: true });
        setProperties(data);
        if (data.length && !propertyId) {
          setPropertyId(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load your properties.");
      } finally {
        setLoadingProperties(false);
      }
    };
    void loadProperties();
  }, [propertyId]);

  useEffect(() => {
    const loadForecast = async () => {
      if (!propertyId) return;
      setLoadingForecast(true);
      try {
        const data = await apiFetch<ForecastResponse>(
          `/api/analytics/forecast?property_id=${propertyId}&time_range=${timeRange}`,
          { auth: true }
        );
        setForecast(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load the forecast.");
      } finally {
        setLoadingForecast(false);
      }
    };
    void loadForecast();
  }, [propertyId, timeRange]);

  useEffect(() => {
    const loadInsights = async () => {
      setLoadingInsights(true);
      try {
        const data = await apiFetch<InsightResponse>("/api/insights", { auth: true });
        setInsights(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load AI insights.");
      } finally {
        setLoadingInsights(false);
      }
    };
    void loadInsights();
  }, []);

  const projection = forecast?.projection ?? [];
  const maxValue = useMemo(() => {
    const values = projection.flatMap((item) => [item.income, item.expenses]);
    return Math.max(1, ...values);
  }, [projection]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Analytics & Insights</h2>
            <p className="text-sm text-slate-400">Cash flow forecasts and AI-powered portfolio insights.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Cash Flow Forecast</h3>
            <p className="text-sm text-slate-400">Projected income and expenses per property.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-full border border-slate-700 bg-slate-900/60 p-1">
              {(["monthly", "annual"] as const).map((range) => (
                <Button
                  key={range}
                  type="button"
                  variant={timeRange === range ? "secondary" : "ghost"}
                  onClick={() => setTimeRange(range)}
                  className="rounded-full px-4 py-2 text-xs"
                >
                  {range}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          {loadingProperties && (
            <p className="text-sm text-slate-400">Loading properties...</p>
          )}
          {!loadingProperties && properties.length === 0 && (
            <p className="text-sm text-slate-400">Add a property to see forecasts.</p>
          )}
          <div className="flex min-w-[480px] items-end gap-4">
            {loadingForecast && (
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`loading-${index}`} className="h-32 w-6 animate-pulse rounded-full bg-slate-800/60" />
                ))}
              </div>
            )}
            {!loadingForecast &&
              projection.map((item) => (
              <div key={item.period} className="flex flex-col items-center gap-2">
                <div className="flex h-44 items-end gap-2">
                  <div
                    className="w-4 rounded-full bg-emerald-400/70"
                    style={{ height: `${(item.income / maxValue) * 160}px` }}
                  />
                  <div
                    className="w-4 rounded-full bg-rose-400/70"
                    style={{ height: `${(item.expenses / maxValue) * 160}px` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">{item.period}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" /> Income
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-400/70" /> Expenses
          </span>
          {forecast && (
            <span className="ml-auto">Confidence: {(forecast.confidence * 100).toFixed(0)}%</span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">AI Insights Feed</h3>
            <p className="text-xs text-slate-400">Recent predictions and accuracy.</p>
          </div>
          {insights && (
            <div className="text-right text-xs text-slate-300">
              <p>Accuracy: {insights.metrics.expenseCategorizationAccuracy ?? "-"}</p>
              <p>Sample: {insights.metrics.sampleSize}</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {loadingInsights && <p className="text-sm text-slate-400">Loading insights...</p>}
          {insights?.items?.length ? (
            insights.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-800/60 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">{item.type}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {item.reasoning && <p className="mt-2 text-xs text-slate-300">{item.reasoning}</p>}
                {item.confidence != null && (
                  <p className="mt-2 text-xs text-cyan-200">
                    Confidence: {(item.confidence * 100).toFixed(0)}%
                  </p>
                )}
                {item.output && item.type === "EXPENSE_CATEGORY" && (
                  <p className="mt-2 text-xs text-slate-400">
                    Suggested: {(item.output as { category?: string }).category}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No insights yet.</p>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
