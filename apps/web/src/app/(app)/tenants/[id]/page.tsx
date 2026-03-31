"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

type Property = {
  id: string;
  name: string;
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
};

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

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;
  const [form, setForm] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentLease, setCurrentLease] = useState<Lease | null>(null);
  const [leaseLoading, setLeaseLoading] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<UnitWithLease[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [assignForm, setAssignForm] = useState({
    startDate: "",
    endDate: "",
    rent: "",
    status: "ACTIVE"
  });
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<Tenant>(`/tenants/${tenantId}`, { auth: true });
        setForm(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tenant");
      }
    };

    if (tenantId) {
      void load();
    }
  }, [tenantId]);

  const loadLease = async () => {
    setLeaseLoading(true);
    try {
      const leases = await apiFetch<Lease[]>(`/leases?tenantId=${tenantId}&status=ACTIVE`, {
        auth: true
      });
      setCurrentLease(leases[0] ?? null);
    } catch {
      setCurrentLease(null);
    } finally {
      setLeaseLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      void loadLease();
    }
  }, [tenantId]);

  const update = (key: keyof Tenant, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setLoading(true);
    setError(null);

    try {
      const updated = await apiFetch<Tenant>(`/tenants/${tenantId}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(form)
      });
      setForm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this tenant?")) return;
    setLoading(true);
    try {
      await apiFetch(`/tenants/${tenantId}`, { method: "DELETE", auth: true });
      router.push("/tenants");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tenant");
    } finally {
      setLoading(false);
    }
  };

  const openAssign = async () => {
    setAssignOpen(true);
    setAssignError(null);
    setSelectedPropertyId("");
    setSelectedUnitId("");
    setAssignForm({ startDate: "", endDate: "", rent: "", status: "ACTIVE" });
    const data = await apiFetch<Property[]>("/properties", { auth: true });
    setProperties(data);
  };

  const loadUnits = async (propertyId: string) => {
    const data = await apiFetch<UnitWithLease[]>(`/properties/${propertyId}/units`, { auth: true });
    setUnits(data.filter((unit) => !unit.currentLease));
  };

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnitId) ?? null,
    [units, selectedUnitId]
  );

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPropertyId || !selectedUnitId) {
      setAssignError("Select a property and unit.");
      return;
    }
    if (!assignForm.startDate) {
      setAssignError("Start date is required.");
      return;
    }

    setAssignSaving(true);
    setAssignError(null);
    try {
      await apiFetch(`/properties/${selectedPropertyId}/units/${selectedUnitId}/leases`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          tenantId,
          startDate: assignForm.startDate,
          endDate: assignForm.endDate || undefined,
          rent: assignForm.rent ? Number(assignForm.rent) : selectedUnit?.rent ?? 0,
          status: assignForm.status
        })
      });
      setAssignOpen(false);
      await loadLease();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign tenant");
    } finally {
      setAssignSaving(false);
    }
  };

  if (!form) {
    return <p className="text-sm text-slate-400">Loading tenant...</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">
            {form.firstName} {form.lastName}
          </h2>
          <p className="text-sm text-slate-400">Update contact details.</p>
        </div>
        <Button variant="destructive" onClick={onDelete} disabled={loading}>
          Delete
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">First Name</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Last Name</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.email ?? ""}
            onChange={(event) => update("email", event.target.value)}
            type="email"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Phone</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.phone ?? ""}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>

        {error && <div className="md:col-span-2 text-sm text-rose-300">{error}</div>}

        <div className="md:col-span-2 flex justify-end">
          <Button disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button>
        </div>
      </form>

      <section className="mt-12 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Current Lease</h3>
            <p className="text-sm text-slate-400">Where this tenant is currently assigned.</p>
          </div>
          {!currentLease && !leaseLoading && (
            <Button onClick={openAssign}>Assign to Unit</Button>
          )}
        </div>

        {leaseLoading && <p className="mt-4 text-sm text-slate-400">Loading lease...</p>}

        {!leaseLoading && currentLease ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Property</p>
              <p className="mt-2 text-sm text-slate-100">{currentLease.property.name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Unit</p>
              <p className="mt-2 text-sm text-slate-100">{currentLease.unit.label}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Dates</p>
              <p className="mt-2 text-sm text-slate-100">
                {formatDate(currentLease.startDate)} → {formatDate(currentLease.endDate)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Rent</p>
              <p className="mt-2 text-sm text-slate-100">{formatCurrency(currentLease.rent)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-2 text-sm text-slate-100">{currentLease.status}</p>
            </div>
          </div>
        ) : (
          !leaseLoading && (
            <p className="mt-6 text-sm text-slate-400">
              Unassigned. Use the button above to place this tenant in a unit.
            </p>
          )
        )}
      </section>

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Assign to Unit</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setAssignOpen(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitAssignment} className="mt-4 grid gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Property</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={selectedPropertyId}
                  onChange={async (event) => {
                    const value = event.target.value;
                    setSelectedPropertyId(value);
                    setSelectedUnitId("");
                    if (value) {
                      await loadUnits(value);
                    } else {
                      setUnits([]);
                    }
                  }}
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Unit</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={selectedUnitId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedUnitId(value);
                    const unit = units.find((item) => item.id === value);
                    setAssignForm((prev) => ({
                      ...prev,
                      rent: unit?.rent ? String(unit.rent) : prev.rent
                    }));
                  }}
                  disabled={!selectedPropertyId}
                >
                  <option value="">Select unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Start Date</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={assignForm.startDate}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  type="date"
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">End Date</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={assignForm.endDate}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  type="date"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Rent</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={assignForm.rent}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, rent: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Status</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={assignForm.status}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ENDED">Ended</option>
                </select>
              </div>

              {assignError && <p className="text-sm text-rose-300">{assignError}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={assignSaving}>{assignSaving ? "Assigning..." : "Assign"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
