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
  unitCount?: number;
  vacancyCount?: number;
};

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<Property[]>("/properties", { auth: true });
        setProperties(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load your properties.");
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
          <h2 className="text-2xl font-semibold">Properties</h2>
          <p className="text-sm text-slate-400">Track assets, unit counts, and performance.</p>
        </div>
        <Button asChild>
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
            <h3 className="text-lg font-semibold text-slate-100">{property.name}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {property.addressLine1}, {property.city}, {property.state} {property.postalCode}
            </p>
            {(property.unitCount !== undefined || property.vacancyCount !== undefined) && (
              <p className="mt-2 text-xs text-slate-500">
                {property.unitCount ?? 0} unit{(property.unitCount ?? 0) !== 1 ? "s" : ""}
                {" · "}
                {property.vacancyCount ?? 0} vacant
              </p>
            )}
          </Link>
        ))}

        {properties.length === 0 && !error && !loading && (
          <div className="rounded-2xl border border-dashed border-slate-700/70 p-6 text-sm text-slate-400">
            No properties yet. Add your first property to begin tracking units and tenants.
          </div>
        )}
      </div>
    </div>
  );
}
