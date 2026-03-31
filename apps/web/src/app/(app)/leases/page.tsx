"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
};

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
};

type UnitWithLease = {
  id: string;
  label: string;
  rent?: number | null;
  currentLease?: { id: string } | null;
};

type Lease = {
  id: string;
  startDate: string;
  endDate?: string | null;
  rent: number;
  status: "DRAFT" | "ACTIVE" | "ENDED";
  property: Property;
  unit: UnitWithLease;
  tenant: Tenant;
};

type LeaseStatusFilter = "ALL" | "ACTIVE" | "ENDED" | "DRAFT" | "EXPIRED";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString()}`;
};

const isExpired = (lease: Lease) => {
  if (!lease.endDate) return false;
  const endDate = new Date(lease.endDate);
  return lease.status === "ACTIVE" && endDate.getTime() < Date.now();
};

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeaseStatusFilter>("ALL");

  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);
  const [leaseFormError, setLeaseFormError] = useState<string | null>(null);
  const [leaseSaving, setLeaseSaving] = useState(false);

  const [units, setUnits] = useState<UnitWithLease[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const [leaseForm, setLeaseForm] = useState({
    propertyId: "",
    unitId: "",
    tenantMode: "select" as "select" | "create",
    tenantId: "",
    newTenant: { firstName: "", lastName: "", email: "", phone: "" },
    startDate: "",
    endDate: "",
    rent: "",
    status: "ACTIVE"
  });

  const [viewLease, setViewLease] = useState<Lease | null>(null);

  const loadProperties = async () => {
    const data = await apiFetch<Property[]>("/properties", { auth: true });
    setProperties(data);
  };

  const loadTenants = async () => {
    const data = await apiFetch<Tenant[]>("/tenants", { auth: true });
    setTenants(data);
  };

  const loadUnits = async (propertyId: string, allowUnitId?: string) => {
    const data = await apiFetch<UnitWithLease[]>(`/properties/${propertyId}/units`, { auth: true });
    setUnits(
      data.filter((unit) => !unit.currentLease || (allowUnitId && unit.id === allowUnitId))
    );
  };

  const loadLeases = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (selectedProperty) query.set("propertyId", selectedProperty);

      if (statusFilter !== "ALL" && statusFilter !== "EXPIRED") {
        query.set("status", statusFilter);
      }

      const data = await apiFetch<Lease[]>(`/leases${query.toString() ? `?${query}` : ""}`, {
        auth: true
      });

      const filtered =
        statusFilter === "EXPIRED" ? data.filter((lease) => isExpired(lease)) : data;
      setLeases(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leases.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProperties();
    void loadTenants();
  }, []);

  useEffect(() => {
    void loadLeases();
  }, [selectedProperty, statusFilter]);

  const openCreateModal = () => {
    setEditingLease(null);
    setLeaseFormError(null);
    setLeaseForm({
      propertyId: "",
      unitId: "",
      tenantMode: "select",
      tenantId: "",
      newTenant: { firstName: "", lastName: "", email: "", phone: "" },
      startDate: "",
      endDate: "",
      rent: "",
      status: "ACTIVE"
    });
    setUnits([]);
    setShowLeaseModal(true);
  };

  const openEditModal = async (lease: Lease) => {
    setEditingLease(lease);
    setLeaseFormError(null);
    setLeaseForm({
      propertyId: lease.property.id,
      unitId: lease.unit.id,
      tenantMode: "select",
      tenantId: lease.tenant.id,
      newTenant: { firstName: "", lastName: "", email: "", phone: "" },
      startDate: lease.startDate.slice(0, 10),
      endDate: lease.endDate ? lease.endDate.slice(0, 10) : "",
      rent: String(lease.rent ?? ""),
      status: lease.status
    });
    await loadUnits(lease.property.id, lease.unit.id);
    setShowLeaseModal(true);
  };

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === leaseForm.unitId) ?? null,
    [units, leaseForm.unitId]
  );

  const submitLease = async (event: React.FormEvent) => {
    event.preventDefault();
    setLeaseFormError(null);

    if (!leaseForm.propertyId || !leaseForm.unitId) {
      setLeaseFormError("Select a property and unit.");
      return;
    }

    if (!leaseForm.startDate) {
      setLeaseFormError("Start date is required.");
      return;
    }

    let tenantId = leaseForm.tenantId;

    if (leaseForm.tenantMode === "create") {
      if (!leaseForm.newTenant.firstName || !leaseForm.newTenant.lastName) {
        setLeaseFormError("First and last name are required.");
        return;
      }

      setLeaseSaving(true);
      try {
        const created = await apiFetch<Tenant>("/tenants", {
          method: "POST",
          auth: true,
          body: JSON.stringify(leaseForm.newTenant)
        });
        setTenants((prev) => [created, ...prev]);
        tenantId = created.id;
      } catch (err) {
        setLeaseSaving(false);
        setLeaseFormError(err instanceof Error ? err.message : "Failed to create tenant");
        return;
      }
    }

    if (!tenantId) {
      setLeaseFormError("Select a tenant.");
      return;
    }

    setLeaseSaving(true);

    try {
      if (editingLease) {
        await apiFetch(`/leases/${editingLease.id}`, {
          method: "PATCH",
          auth: true,
          body: JSON.stringify({
            propertyId: leaseForm.propertyId,
            unitId: leaseForm.unitId,
            tenantId,
            startDate: leaseForm.startDate,
            endDate: leaseForm.endDate || undefined,
            rent: leaseForm.rent ? Number(leaseForm.rent) : selectedUnit?.rent ?? 0,
            status: leaseForm.status
          })
        });
      } else {
        await apiFetch(`/properties/${leaseForm.propertyId}/units/${leaseForm.unitId}/leases`, {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            tenantId,
            startDate: leaseForm.startDate,
            endDate: leaseForm.endDate || undefined,
            rent: leaseForm.rent ? Number(leaseForm.rent) : selectedUnit?.rent ?? 0,
            status: leaseForm.status
          })
        });
      }

      setShowLeaseModal(false);
      await loadLeases();
    } catch (err) {
      setLeaseFormError(err instanceof Error ? err.message : "Failed to save lease");
    } finally {
      setLeaseSaving(false);
    }
  };

  const endLease = async (lease: Lease) => {
    if (!confirm("End this lease?")) return;
    try {
      await apiFetch(`/leases/${lease.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ status: "ENDED" })
      });
      await loadLeases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end lease");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Leases</h2>
          <p className="text-sm text-slate-400">Manage active and upcoming leases.</p>
        </div>
        <Button onClick={openCreateModal}>New Lease</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          className="rounded-full border border-slate-700/60 bg-slate-950/60 px-4 py-2 text-sm text-slate-200"
          value={selectedProperty}
          onChange={(event) => setSelectedProperty(event.target.value)}
        >
          <option value="">All Properties</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-full border border-slate-700/60 bg-slate-950/60 px-4 py-2 text-sm text-slate-200"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as LeaseStatusFilter)}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Ended</option>
          <option value="DRAFT">Draft</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800/70">
        <div className="grid grid-cols-7 gap-4 border-b border-slate-800/70 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
          <span>Tenant</span>
          <span>Property</span>
          <span>Unit</span>
          <span>Start</span>
          <span>End</span>
          <span>Rent</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-slate-800/70">
          {loading && (
            <div className="px-4 py-6 text-sm text-slate-400">Loading leases...</div>
          )}
          {!loading && leases.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-400">No leases yet.</div>
          )}
          {leases.map((lease) => (
            <div
              key={lease.id}
              className="grid grid-cols-7 gap-4 px-4 py-4 text-sm text-slate-200"
            >
              <span>
                {lease.tenant.firstName} {lease.tenant.lastName}
              </span>
              <span>{lease.property.name}</span>
              <span>{lease.unit.label}</span>
              <span>{formatDate(lease.startDate)}</span>
              <span>{formatDate(lease.endDate)}</span>
              <span>{formatCurrency(lease.rent)}</span>
              <span className="flex items-center gap-2">
                <span>{lease.status}</span>
                {isExpired(lease) && <span className="text-xs text-amber-300">Expired</span>}
              </span>
              <div className="col-span-7 mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setViewLease(lease)}>
                  View
                </Button>
                <Button variant="secondary" onClick={() => void openEditModal(lease)}>
                  Edit
                </Button>
                {lease.status === "ACTIVE" && (
                  <Button variant="destructive" onClick={() => void endLease(lease)}>
                    End Lease
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showLeaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {editingLease ? "Edit Lease" : "Create Lease"}
              </h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowLeaseModal(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitLease} className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Property</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.propertyId}
                  onChange={async (event) => {
                    const value = event.target.value;
                    setLeaseForm((prev) => ({ ...prev, propertyId: value, unitId: "" }));
                    if (value) {
                      await loadUnits(value, editingLease?.unit.id);
                    } else {
                      setUnits([]);
                    }
                  }}
                  required
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Unit</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.unitId}
                  onChange={(event) => {
                    const value = event.target.value;
                    const unitRent = units.find((unit) => unit.id === value)?.rent;
                    setLeaseForm((prev) => ({
                      ...prev,
                      unitId: value,
                      rent: unitRent ? String(unitRent) : prev.rent
                    }));
                  }}
                  required
                >
                  <option value="">Select unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-full border px-4 py-2 text-sm ${
                      leaseForm.tenantMode === "select"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700/70 text-slate-300"
                    }`}
                    onClick={() => setLeaseForm((prev) => ({ ...prev, tenantMode: "select" }))}
                  >
                    Select Tenant
                  </button>
                  <button
                    type="button"
                    className={`rounded-full border px-4 py-2 text-sm ${
                      leaseForm.tenantMode === "create"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700/70 text-slate-300"
                    }`}
                    onClick={() => setLeaseForm((prev) => ({ ...prev, tenantMode: "create" }))}
                  >
                    Create Tenant
                  </button>
                </div>
              </div>

              {leaseForm.tenantMode === "select" ? (
                <div className="md:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Tenant</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={leaseForm.tenantId}
                    onChange={(event) =>
                      setLeaseForm((prev) => ({ ...prev, tenantId: event.target.value }))
                    }
                  >
                    <option value="">Select tenant</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.firstName} {tenant.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-400">First Name</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                      value={leaseForm.newTenant.firstName}
                      onChange={(event) =>
                        setLeaseForm((prev) => ({
                          ...prev,
                          newTenant: { ...prev.newTenant, firstName: event.target.value }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-400">Last Name</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                      value={leaseForm.newTenant.lastName}
                      onChange={(event) =>
                        setLeaseForm((prev) => ({
                          ...prev,
                          newTenant: { ...prev.newTenant, lastName: event.target.value }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                      value={leaseForm.newTenant.email}
                      onChange={(event) =>
                        setLeaseForm((prev) => ({
                          ...prev,
                          newTenant: { ...prev.newTenant, email: event.target.value }
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-400">Phone</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                      value={leaseForm.newTenant.phone}
                      onChange={(event) =>
                        setLeaseForm((prev) => ({
                          ...prev,
                          newTenant: { ...prev.newTenant, phone: event.target.value }
                        }))
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Start Date</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.startDate}
                  onChange={(event) => setLeaseForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  type="date"
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">End Date</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.endDate}
                  onChange={(event) => setLeaseForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  type="date"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Rent</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.rent}
                  onChange={(event) => setLeaseForm((prev) => ({ ...prev, rent: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Status</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={leaseForm.status}
                  onChange={(event) => setLeaseForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ENDED">Ended</option>
                </select>
              </div>

              {leaseFormError && <p className="md:col-span-2 text-sm text-rose-300">{leaseFormError}</p>}

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowLeaseModal(false)}>
                  Cancel
                </Button>
                <Button disabled={leaseSaving}>{leaseSaving ? "Saving..." : "Save Lease"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Lease Details</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setViewLease(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                Tenant: {viewLease.tenant.firstName} {viewLease.tenant.lastName}
              </p>
              <p>Property: {viewLease.property.name}</p>
              <p>Unit: {viewLease.unit.label}</p>
              <p>Start: {formatDate(viewLease.startDate)}</p>
              <p>End: {formatDate(viewLease.endDate)}</p>
              <p>Rent: {formatCurrency(viewLease.rent)}</p>
              <p>Status: {viewLease.status}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
