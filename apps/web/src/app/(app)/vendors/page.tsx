"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ServiceCategory, Vendor, serviceCategoryLabels } from "@/lib/types";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | "all">("all");
  const [_successMessage, _setSuccessMessage] = useState<string | null>(null);

  // Note: showToast was unused, removing it

  const filteredVendors = vendors.filter(vendor => {
    const statusMatch = showInactive ? !vendor.isActive : vendor.isActive;
    const categoryMatch = selectedCategory === "all" || vendor.serviceCategories.includes(selectedCategory);
    return statusMatch && categoryMatch;
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCategory !== "all") {
          params.append("serviceCategory", selectedCategory);
        }
        if (showInactive) {
          params.append("isActive", "false");
        }
        
        const url = `/vendors${params.toString() ? `?${params.toString()}` : ""}`;
        const data = await apiFetch<Vendor[]>(url, { auth: true });
        setVendors(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load your vendors.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCategory, showInactive]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Vendor Management</h2>
          <p className="text-sm text-slate-400">Manage contractors and service providers for maintenance.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button
              className={`rounded-full border px-4 py-2 text-sm ${
                !showInactive
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                  : "border-slate-700/70 text-slate-300 hover:border-slate-600"
              }`}
              onClick={() => setShowInactive(false)}
            >
              Active
            </button>
            <button
              className={`rounded-full border px-4 py-2 text-sm ${
                showInactive
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                  : "border-slate-700/70 text-slate-300 hover:border-slate-600"
              }`}
              onClick={() => setShowInactive(true)}
            >
              Inactive
            </button>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as ServiceCategory | "all")}
            className="rounded-full border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm text-slate-300 hover:border-slate-600"
          >
            <option value="all">All Categories</option>
            {Object.entries(serviceCategoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Button asChild>
            <Link href="/vendors/new">Add Vendor</Link>
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      {_successMessage && <p className="mt-4 text-sm text-emerald-300">{_successMessage}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`loading-${index}`}
              className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-950/40"
            />
          ))}
        
        {!loading && filteredVendors.length === 0 && (
          <div className="col-span-full">
            <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/40 p-8 text-center">
              <h3 className="font-medium text-slate-300">
                {showInactive ? "No inactive vendors found" : "No vendors found"}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {selectedCategory === "all" 
                  ? "Add your first vendor to get started with maintenance management."
                  : `No vendors found for ${serviceCategoryLabels[selectedCategory]}`}
              </p>
              {!showInactive && (
                <Button asChild className="mt-4">
                  <Link href="/vendors/new">Add Your First Vendor</Link>
                </Button>
              )}
            </div>
          </div>
        )}

        {filteredVendors.map((vendor) => (
          <div
            key={vendor.id}
            className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5"
          >
            <Link
              href={`/vendors/${vendor.id}`}
              className="block transition hover:opacity-80"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100">{vendor.name}</h3>
                <span className={`rounded-full px-2 py-1 text-xs ${
                  vendor.isActive 
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-slate-700/50 text-slate-400"
                }`}>
                  {vendor.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              
              {vendor.trade && (
                <p className="mt-1 text-sm text-slate-400">{vendor.trade}</p>
              )}
              
              <div className="mt-3 flex flex-wrap gap-1">
                {vendor.serviceCategories.slice(0, 3).map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200"
                  >
                    {serviceCategoryLabels[category]}
                  </span>
                ))}
                {vendor.serviceCategories.length > 3 && (
                  <span className="rounded-full bg-slate-700/50 px-2 py-1 text-xs text-slate-400">
                    +{vendor.serviceCategories.length - 3} more
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-400">
                {vendor.email && (
                  <div className="flex items-center gap-1">
                    <span>📧</span>
                    <span>{vendor.email}</span>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-1">
                    <span>📞</span>
                    <span>{vendor.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-2 text-xs text-slate-500">
                {vendor.maintenanceRequestCount} active requests
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}