"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes?: string | null;
};

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

type Lease = {
  id: string;
  startDate: string;
  endDate?: string | null;
  rent: number;
  status: "DRAFT" | "ACTIVE" | "ENDED";
  tenant: Tenant;
};

type UnitWithLease = {
  id: string;
  label: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  rent?: number | null;
  currentLease?: Lease | null;
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

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;
  const [form, setForm] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [units, setUnits] = useState<UnitWithLease[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({
    label: "",
    bedrooms: "",
    bathrooms: "",
    squareFeet: "",
    rent: ""
  });
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitFormError, setUnitFormError] = useState<string | null>(null);

  const [showLeaseDrawer, setShowLeaseDrawer] = useState(false);
  const [leaseStep, setLeaseStep] = useState<1 | 2>(1);
  const [tenantMode, setTenantMode] = useState<"select" | "create">("select");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [newTenantForm, setNewTenantForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: ""
  });
  const [leaseForm, setLeaseForm] = useState({
    startDate: "",
    endDate: "",
    rent: "",
    status: "ACTIVE",
    deposit: ""
  });
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const [leaseSaving, setLeaseSaving] = useState(false);
  const [activeUnit, setActiveUnit] = useState<UnitWithLease | null>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const [viewLease, setViewLease] = useState<Lease | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<Property>(`/properties/${propertyId}`, { auth: true });
        setForm(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load property");
      }
    };

    if (propertyId) {
      void load();
    }
  }, [propertyId]);

  const loadUnits = async () => {
    setUnitsLoading(true);
    setUnitsError(null);
    try {
      const data = await apiFetch<UnitWithLease[]>(`/properties/${propertyId}/units`, { auth: true });
      setUnits(data);
    } catch (err) {
      setUnitsError(err instanceof Error ? err.message : "Failed to load units");
    } finally {
      setUnitsLoading(false);
    }
  };

  useEffect(() => {
    if (propertyId) {
      void loadUnits();
    }
  }, [propertyId]);

  const loadTenants = async () => {
    setTenantsLoading(true);
    try {
      const data = await apiFetch<Tenant[]>("/tenants", { auth: true });
      setTenants(data);
    } finally {
      setTenantsLoading(false);
    }
  };

  const update = (key: keyof Property, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setLoading(true);
    setError(null);

    try {
      const updated = await apiFetch<Property>(`/properties/${propertyId}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(form)
      });
      setForm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update property");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this property?")) return;
    setLoading(true);
    try {
      await apiFetch(`/properties/${propertyId}`, { method: "DELETE", auth: true });
      router.push("/properties");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete property");
    } finally {
      setLoading(false);
    }
  };

  const openAddUnit = () => {
    setUnitForm({ label: "", bedrooms: "", bathrooms: "", squareFeet: "", rent: "" });
    setUnitFormError(null);
    setShowAddUnit(true);
  };

  const submitUnit = async (event: FormEvent) => {
    event.preventDefault();
    setUnitSaving(true);
    setUnitFormError(null);

    try {
      await apiFetch(`/properties/${propertyId}/units`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          label: unitForm.label,
          bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : undefined,
          bathrooms: unitForm.bathrooms ? Number(unitForm.bathrooms) : undefined,
          squareFeet: unitForm.squareFeet ? Number(unitForm.squareFeet) : undefined,
          rent: unitForm.rent ? Number(unitForm.rent) : undefined
        })
      });
      setShowAddUnit(false);
      await loadUnits();
    } catch (err) {
      setUnitFormError(err instanceof Error ? err.message : "Failed to add unit");
    } finally {
      setUnitSaving(false);
    }
  };

  const openLeaseFlow = async (unit: UnitWithLease) => {
    setActiveUnit(unit);
    setLeaseStep(1);
    setTenantMode("select");
    setSelectedTenantId("");
    setNewTenantForm({ firstName: "", lastName: "", email: "", phone: "" });
    setLeaseForm({
      startDate: "",
      endDate: "",
      rent: unit.rent ? String(unit.rent) : "",
      status: "ACTIVE",
      deposit: ""
    });
    setLeaseError(null);
    setShowLeaseDrawer(true);
    await loadTenants();
  };

  const activeTenant = useMemo(() => {
    if (!selectedTenantId) return null;
    return tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  }, [selectedTenantId, tenants]);

  const continueToLeaseTerms = async () => {
    setLeaseError(null);

    if (tenantMode === "select") {
      if (!selectedTenantId) {
        setLeaseError("Select a tenant to continue.");
        return;
      }
      setLeaseStep(2);
      return;
    }

    if (!newTenantForm.firstName || !newTenantForm.lastName) {
      setLeaseError("First and last name are required.");
      return;
    }

    setLeaseSaving(true);
    try {
      const created = await apiFetch<Tenant>("/tenants", {
        method: "POST",
        auth: true,
        body: JSON.stringify(newTenantForm)
      });
      setTenants((prev) => [created, ...prev]);
      setSelectedTenantId(created.id);
      setLeaseStep(2);
    } catch (err) {
      setLeaseError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setLeaseSaving(false);
    }
  };

  const submitLease = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeUnit) return;
    if (!selectedTenantId) {
      setLeaseError("Select a tenant to continue.");
      return;
    }
    if (!leaseForm.startDate) {
      setLeaseError("Start date is required.");
      return;
    }

    setLeaseSaving(true);
    setLeaseError(null);
    try {
      await apiFetch(`/properties/${propertyId}/units/${activeUnit.id}/leases`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          tenantId: selectedTenantId,
          startDate: leaseForm.startDate,
          endDate: leaseForm.endDate || undefined,
          rent: leaseForm.rent ? Number(leaseForm.rent) : activeUnit.rent ?? 0,
          status: leaseForm.status
        })
      });
      setShowLeaseDrawer(false);
      setActiveUnit(null);
      await loadUnits();
    } catch (err) {
      setLeaseError(err instanceof Error ? err.message : "Failed to create lease");
    } finally {
      setLeaseSaving(false);
    }
  };

  if (!form) {
    return <p className="text-sm text-slate-400">Loading property...</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{form.name}</h2>
          <p className="text-sm text-slate-400">Update address and portfolio notes.</p>
        </div>
        <Button variant="destructive" onClick={onDelete} disabled={loading}>
          Delete
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-slate-400">Property Name</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-slate-400">Address Line 1</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.addressLine1}
            onChange={(event) => update("addressLine1", event.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-slate-400">Address Line 2</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.addressLine2 ?? ""}
            onChange={(event) => update("addressLine2", event.target.value)}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">City</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.city}
            onChange={(event) => update("city", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">State</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.state}
            onChange={(event) => update("state", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Postal Code</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.postalCode}
            onChange={(event) => update("postalCode", event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Country</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={form.country}
            onChange={(event) => update("country", event.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
          <textarea
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            rows={3}
            value={form.notes ?? ""}
            onChange={(event) => update("notes", event.target.value)}
          />
        </div>

        {error && <div className="md:col-span-2 text-sm text-rose-300">{error}</div>}

        <div className="md:col-span-2 flex justify-end">
          <Button disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button>
        </div>
      </form>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Units</h3>
            <p className="text-sm text-slate-400">Track occupancy and assign tenants.</p>
          </div>
          <Button onClick={openAddUnit}>Add Unit</Button>
        </div>

        {unitsError && <p className="mt-4 text-sm text-rose-300">{unitsError}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {unitsLoading &&
            Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`units-loading-${index}`}
                className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-950/40"
              />
            ))}

          {units.map((unit) => {
            const lease = unit.currentLease;
            const occupied = Boolean(lease);
            return (
              <div
                key={unit.id}
                className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-100">{unit.label}</h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {unit.bedrooms ?? "—"} bd · {unit.bathrooms ?? "—"} ba · {unit.squareFeet ?? "—"} sqft
                    </p>
                    <p className="mt-2 text-sm text-slate-300">Rent: {formatCurrency(unit.rent)}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      occupied
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-slate-800/70 text-slate-300"
                    }`}
                  >
                    {occupied ? "Occupied" : "Vacant"}
                  </span>
                </div>

                <div className="mt-4 text-sm text-slate-300">
                  {occupied ? (
                    <>
                      <p>
                        Tenant: {lease?.tenant.firstName} {lease?.tenant.lastName}
                      </p>
                      <p>
                        Lease: {formatDate(lease?.startDate)} → {formatDate(lease?.endDate)}
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-400">No active lease</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {occupied ? (
                    <Button variant="secondary" onClick={() => setViewLease(lease ?? null)}>
                      View Lease
                    </Button>
                  ) : (
                    <Button onClick={() => openLeaseFlow(unit)}>Add Tenant</Button>
                  )}
                </div>
              </div>
            );
          })}

          {!unitsLoading && units.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700/70 p-6 text-sm text-slate-400">
              No units yet. Add your first unit for this property.
            </div>
          )}
        </div>
      </section>

      {showAddUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Add Unit</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowAddUnit(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitUnit} className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Label</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={unitForm.label}
                  onChange={(event) => setUnitForm((prev) => ({ ...prev, label: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Beds</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={unitForm.bedrooms}
                  onChange={(event) => setUnitForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Baths</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={unitForm.bathrooms}
                  onChange={(event) => setUnitForm((prev) => ({ ...prev, bathrooms: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.5"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Sqft</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={unitForm.squareFeet}
                  onChange={(event) => setUnitForm((prev) => ({ ...prev, squareFeet: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Monthly Rent</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={unitForm.rent}
                  onChange={(event) => setUnitForm((prev) => ({ ...prev, rent: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>

              {unitFormError && <p className="md:col-span-2 text-sm text-rose-300">{unitFormError}</p>}

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setShowAddUnit(false)}>
                  Cancel
                </Button>
                <Button disabled={unitSaving}>{unitSaving ? "Saving..." : "Add Unit"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLeaseDrawer && activeUnit && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-700/70 bg-slate-950/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Assign Tenant</p>
                <h4 className="text-xl font-semibold">{activeUnit.label}</h4>
                <p className="text-sm text-slate-400">{formatCurrency(activeUnit.rent)} / month</p>
              </div>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowLeaseDrawer(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <span className={leaseStep === 1 ? "text-cyan-300" : "text-slate-500"}>Step 1</span>
              <span>·</span>
              <span className={leaseStep === 2 ? "text-cyan-300" : "text-slate-500"}>Step 2</span>
            </div>

            {leaseStep === 1 ? (
              <div className="mt-6">
                <div className="flex gap-2">
                  <button
                    className={`rounded-full border px-4 py-2 text-sm ${
                      tenantMode === "select"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700/70 text-slate-300"
                    }`}
                    onClick={() => setTenantMode("select")}
                  >
                    Select Existing
                  </button>
                  <button
                    className={`rounded-full border px-4 py-2 text-sm ${
                      tenantMode === "create"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700/70 text-slate-300"
                    }`}
                    onClick={() => setTenantMode("create")}
                  >
                    Create New
                  </button>
                </div>

                {tenantMode === "select" ? (
                  <div className="mt-4">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Tenant</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                      value={selectedTenantId}
                      onChange={(event) => setSelectedTenantId(event.target.value)}
                      disabled={tenantsLoading}
                    >
                      <option value="">Select tenant</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.firstName} {tenant.lastName}
                        </option>
                      ))}
                    </select>
                    {tenants.length === 0 && !tenantsLoading && (
                      <p className="mt-2 text-xs text-slate-500">No tenants yet. Create one.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">First Name</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                        value={newTenantForm.firstName}
                        onChange={(event) =>
                          setNewTenantForm((prev) => ({ ...prev, firstName: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Last Name</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                        value={newTenantForm.lastName}
                        onChange={(event) =>
                          setNewTenantForm((prev) => ({ ...prev, lastName: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                        value={newTenantForm.email}
                        onChange={(event) =>
                          setNewTenantForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        type="email"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Phone</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                        value={newTenantForm.phone}
                        onChange={(event) =>
                          setNewTenantForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                {leaseError && <p className="mt-4 text-sm text-rose-300">{leaseError}</p>}

                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowLeaseDrawer(false)}>
                    Cancel
                  </Button>
                  <Button onClick={continueToLeaseTerms} disabled={leaseSaving}>
                    {leaseSaving ? "Saving..." : "Continue"}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitLease} className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Tenant</p>
                  <p className="mt-2 text-base text-slate-100">
                    {activeTenant
                      ? `${activeTenant.firstName} ${activeTenant.lastName}`
                      : "Selected tenant"}
                  </p>
                </div>
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
                  <label className="text-xs uppercase tracking-wide text-slate-400">Monthly Rent</label>
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
                    onChange={(event) =>
                      setLeaseForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ENDED">Ended</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Deposit (optional)</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={leaseForm.deposit}
                    onChange={(event) => setLeaseForm((prev) => ({ ...prev, deposit: event.target.value }))}
                    type="number"
                    min="0"
                  />
                </div>

                {leaseError && <p className="text-sm text-rose-300">{leaseError}</p>}

                <div className="mt-2 flex justify-between gap-2">
                  <Button type="button" variant="secondary" onClick={() => setLeaseStep(1)}>
                    Back
                  </Button>
                  <Button disabled={leaseSaving}>
                    {leaseSaving ? "Creating..." : "Create Lease"}
                  </Button>
                </div>
              </form>
            )}
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
