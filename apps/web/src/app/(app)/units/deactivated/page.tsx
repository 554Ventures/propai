"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Unit = {
  id: string;
  label: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  rent?: number | null;
  archivedAt: string;
  propertyId: string;
  property?: { id: string; name: string } | null;
};

function friendlyError(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  return fallback;
}

function formatArchivedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DeactivatedUnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Unit[]>("/units?status=deactivated", { auth: true });
      setUnits(data);
    } catch (err) {
      setError(friendlyError(err, "We couldn't load deactivated units."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reactivate = async (unitId: string) => {
    if (!confirm("Reactivate this unit?")) return;
    setError(null);
    setReactivatingId(unitId);

    try {
      await apiFetch(`/units/${unitId}/reactivate`, { method: "PATCH", auth: true });
      setUnits((prev) => prev.filter((unit) => unit.id !== unitId));
      setSuccessMessage("Unit reactivated.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(friendlyError(err, "Failed to reactivate unit."));
    } finally {
      setReactivatingId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { property: Unit["property"]; units: Unit[] }>();
    units.forEach((unit) => {
      const key = unit.property?.id ?? unit.propertyId;
      const entry = map.get(key) ?? { property: unit.property ?? null, units: [] };
      entry.units.push(unit);
      map.set(key, entry);
    });

    return Array.from(map.values()).sort((a, b) => {
      const an = a.property?.name ?? "";
      const bn = b.property?.name ?? "";
      return an.localeCompare(bn);
    });
  }, [units]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Deactivated Units</h2>
          <p className="mt-2 text-sm text-slate-400">
            Units you’ve deactivated (off-market, sold, etc). You can reactivate them here.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/units">Back to Units</Link>
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      {successMessage && <p className="mt-4 text-sm text-emerald-300">{successMessage}</p>}

      <div className="mt-6 grid gap-4">
        {loading && (
          <div className="h-24 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-950/40" />
        )}

        {!loading && grouped.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/40 p-6 text-sm text-slate-300">
            No deactivated units.
          </div>
        )}

        {grouped.map((group) => (
          <section
            key={group.property?.id ?? `property-${group.units[0]?.propertyId}`}
            className="rounded-3xl border border-slate-800/70 bg-slate-950/60 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{group.property?.name ?? "Property"}</h3>
                <p className="mt-1 text-xs text-slate-400">{group.units.length} unit(s)</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {group.units.map((unit) => (
                <div
                  key={unit.id}
                  className="rounded-2xl border border-slate-800/70 bg-slate-900/30 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{unit.label}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Deactivated: <span className="text-slate-200">{formatArchivedAt(unit.archivedAt)}</span>
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      disabled={reactivatingId === unit.id}
                      onClick={() => void reactivate(unit.id)}
                    >
                      {reactivatingId === unit.id ? "Reactivating..." : "Reactivate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

