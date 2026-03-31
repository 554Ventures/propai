"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import DashboardAiChat from "@/components/dashboard-ai-chat";

type Metrics = {
  occupancyRate: number;
  totalIncome: number;
  outstandingRent: number;
  maintenanceCosts: number;
  totals: {
    properties: number;
    units: number;
    tenants: number;
    occupiedUnits: number;
  };
};

type AlertItem = {
  id: string;
  amount?: number;
  dueDate?: string;
  endDate?: string;
  status?: string;
  title?: string;
  createdAt?: string;
  property?: string | null;
  tenant?: string | null;
  unit?: string | null;
  rent?: number;
};

type Alerts = {
  latePayments: { count: number; items: AlertItem[] };
  expiringLeases: { count: number; items: AlertItem[] };
  pendingMaintenance: { count: number; items: AlertItem[] };
};

type Insight = {
  id: string;
  type: string;
  confidence: number | null;
  reasoning: string | null;
  createdAt: string;
  output: Record<string, unknown> | null;
};

type InsightsResponse = {
  items: Insight[];
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [metricsData, alertsData, insightsData] = await Promise.all([
          apiFetch<Metrics>("/api/dashboard/metrics", { auth: true }),
          apiFetch<Alerts>("/api/dashboard/alerts", { auth: true }),
          apiFetch<InsightsResponse>("/api/insights", { auth: true })
        ]);
        setMetrics(metricsData);
        setAlerts(alertsData);
        setInsights(insightsData.items.slice(0, 6));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const occupancy = useMemo(() => {
    if (!metrics) return "-";
    const rate = (metrics.occupancyRate * 100).toFixed(0);
    return `${rate}% (${metrics.totals.occupiedUnits}/${metrics.totals.units})`;
  }, [metrics]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-8">
      <DashboardAiChat />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Properties",
            value: metrics?.totals.properties ?? 0,
            detail: "Portfolio count"
          },
          {
            label: "Units",
            value: metrics?.totals.units ?? 0,
            detail: `Occupancy ${occupancy}`
          },
          {
            label: "Tenants",
            value: metrics?.totals.tenants ?? 0,
            detail: "Active profiles"
          },
          {
            label: "Total Income",
            value: `$${(metrics?.totalIncome ?? 0).toLocaleString()}`,
            detail: "Paid rent receipts"
          }
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-100">{card.value}</p>
            <p className="mt-2 text-xs text-slate-400">{card.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Alerts & Follow-ups</h2>
              <p className="text-sm text-slate-400">Focus on what needs action today.</p>
            </div>
            <div className="text-xs text-slate-400">
              Outstanding rent: <span className="text-rose-200">${(metrics?.outstandingRent ?? 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Late Payments",
                items: alerts?.latePayments.items ?? [],
                empty: "No late payments",
                badge: alerts?.latePayments.count ?? 0
              },
              {
                title: "Expiring Leases",
                items: alerts?.expiringLeases.items ?? [],
                empty: "No leases ending soon",
                badge: alerts?.expiringLeases.count ?? 0
              },
              {
                title: "Pending Maintenance",
                items: alerts?.pendingMaintenance.items ?? [],
                empty: "No maintenance backlog",
                badge: alerts?.pendingMaintenance.count ?? 0
              }
            ].map((group) => (
              <div key={group.title} className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">{group.title}</p>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                    {group.badge}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {group.items.length === 0 && <p className="text-slate-400">{group.empty}</p>}
                  {group.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/60 p-2">
                      <p className="text-xs font-semibold text-slate-200">{item.property ?? "Property"}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.tenant ?? "Tenant"} {item.unit ? `· Unit ${item.unit}` : ""}
                      </p>
                      {item.dueDate && (
                        <p className="text-[11px] text-rose-200">
                          Due {new Date(item.dueDate).toLocaleDateString()}
                        </p>
                      )}
                      {item.endDate && (
                        <p className="text-[11px] text-amber-200">
                          Ends {new Date(item.endDate).toLocaleDateString()}
                        </p>
                      )}
                      {item.title && (
                        <p className="text-[11px] text-slate-300">{item.title}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <p className="text-xs text-slate-400">Jump into daily workflows.</p>
            <div className="mt-4 grid gap-3">
              <Button asChild className="justify-start">
                <Link href="/properties/new">Add property</Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/tenants/new">Add tenant</Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/expenses">Log an expense</Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/documents">Upload document</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent Activity</h3>
              <span className="text-xs text-slate-400">AI + ops feed</span>
            </div>
            <div className="mt-4 space-y-3">
              {insights.length === 0 && (
                <p className="text-sm text-slate-400">No recent insights yet.</p>
              )}
              {insights.map((item) => (
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
