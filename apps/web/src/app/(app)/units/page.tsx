"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export default function UnitsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // We don't currently have a global /units endpoint.
        // Reuse properties as the entry point to manage units.
        const data = await apiFetch<Property[]>("/properties", { auth: true });
        setProperties(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load your units.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Units</h2>
          <p className="text-sm text-slate-400">
            Units are managed per property. Pick a property to view / add units.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/properties/new">Add Property</Link>
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {loading &&
          Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`loading-${index}`}
              className="h-28 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-950/40"
            />
          ))}

        {properties.map((property) => (
          <Link
            key={property.id}
            href={`/properties/${property.id}`}
            className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5 transition hover:border-cyan-400/60"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{property.name}</h3>
                <p className="mt-2 text-sm text-slate-400">
                  {property.addressLine1}, {property.city}, {property.state} {property.postalCode}
                </p>
              </div>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/40 px-3 py-1 text-xs text-slate-200">
                View
              </span>
            </div>
          </Link>
        ))}

        {properties.length === 0 && !error && !loading && (
          <div className="rounded-2xl border border-dashed border-slate-700/70 p-6 text-sm text-slate-400">
            No properties yet. Add your first property to begin tracking units.
          </div>
        )}
      </div>
    </div>
  );
}

