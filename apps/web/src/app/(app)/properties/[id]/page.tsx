"use client";

export const runtime = "edge";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArchiveConfirmModal } from "@/components/ArchiveConfirmModal";

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
  archivedAt?: string | null;
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
  tenantId?: string;
  startDate: string;
  endDate?: string | null;
  rent: number;
  status: "DRAFT" | "ACTIVE" | "ENDED";
  tenant: Tenant;
  unit?: { id: string; label: string };
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

type MaintenanceRequest = {
  id: string;
  title: string;
  description?: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  cost?: number | null;
  createdAt: string;
  unit?: { id: string; label: string } | null;
  tenant?: { id: string; firstName: string; lastName: string } | null;
};

type DocumentRecord = {
  id: string;
  name: string;
  type: string;
  url: string;
  leaseId?: string | null;
  createdAt: string;
};

type UnitCashflow = {
  unitId: string;
  summary: {
    collected: number;
    outstanding: number;
  };
  recentPayments: Array<{
    id: string;
    amount: number;
    status: "PENDING" | "PAID" | "LATE" | "FAILED";
    dueDate: string;
    paidDate?: string | null;
    tenant?: string | null;
  }>;
};

type ForecastPoint = {
  period: string;
  net: number;
};

type PropertyForecast = {
  confidence: number;
  projection: ForecastPoint[];
};

const friendlyError = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message;
  return fallback;
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

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [endLeaseUnit, setEndLeaseUnit] = useState<UnitWithLease | null>(null);
  const [endLeaseLoading, setEndLeaseLoading] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitWithLease | null>(null);
  const [editUnitForm, setEditUnitForm] = useState({ label: "", bedrooms: "", bathrooms: "", squareFeet: "", rent: "" });
  const [editUnitSaving, setEditUnitSaving] = useState(false);
  const [editUnitError, setEditUnitError] = useState<string | null>(null);
  
  const [editLease, setEditLease] = useState<Lease | null>(null);
  const [editLeaseForm, setEditLeaseForm] = useState({ rent: "", startDate: "", endDate: "", status: "ACTIVE", tenantId: "", isMonthToMonth: false });
  const [editLeaseSaving, setEditLeaseSaving] = useState(false);
  const [editLeaseError, setEditLeaseError] = useState<string | null>(null);
  const [editLeaseFieldErrors, setEditLeaseFieldErrors] = useState<Record<string, string>>({});

  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState<"ALL" | "PENDING" | "IN_PROGRESS" | "COMPLETED">("ALL");
  const [maintenanceUnitFilter, setMaintenanceUnitFilter] = useState<"all" | "property" | string>("all");
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: "",
    description: "",
    scope: "property" as "property" | "unit",
    unitId: "",
    cost: ""
  });
  const [maintenanceFormSaving, setMaintenanceFormSaving] = useState(false);
  const [maintenanceFormError, setMaintenanceFormError] = useState<string | null>(null);
  const [showEditPropertyModal, setShowEditPropertyModal] = useState(false);
  const [activeUnitWorkspaceId, setActiveUnitWorkspaceId] = useState<string | null>(null);
  const [unitWorkspaceOpen, setUnitWorkspaceOpen] = useState(false);
  const [showPropertyMaintenancePanel, setShowPropertyMaintenancePanel] = useState(false);
  const [leaseHistory, setLeaseHistory] = useState<Lease[]>([]);
  const [forecast, setForecast] = useState<PropertyForecast | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [workspaceCashflow, setWorkspaceCashflow] = useState<UnitCashflow | null>(null);
  const [workspaceDocs, setWorkspaceDocs] = useState<DocumentRecord[]>([]);
  const [workspaceDataLoading, setWorkspaceDataLoading] = useState(false);
  const [workspaceDataError, setWorkspaceDataError] = useState<string | null>(null);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadType, setDocUploadType] = useState("LEASE");
  const [docUploadName, setDocUploadName] = useState("");
  const [docUploadLeaseId, setDocUploadLeaseId] = useState("");
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docRenamingId, setDocRenamingId] = useState<string | null>(null);
  const [docRenamingValue, setDocRenamingValue] = useState("");
  const [docDeleteBusyId, setDocDeleteBusyId] = useState<string | null>(null);
  const [cashflowTimeframe, setCashflowTimeframe] = useState<"30d" | "90d" | "12m" | "all">("90d");
  const [cashflowActionError, setCashflowActionError] = useState<string | null>(null);
  const [cashflowActionBusyId, setCashflowActionBusyId] = useState<string | null>(null);

  // Archive-related state
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [activeLeaseCount, setActiveLeaseCount] = useState(0);

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

  const loadUnits = useCallback(async () => {
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
  }, [propertyId]);

  const loadMaintenance = useCallback(async (statusFilter?: string, unitFilter?: string) => {
    setMaintenanceLoading(true);
    setMaintenanceError(null);
    try {
      // Use current filter values if not provided as parameters
      const status = statusFilter ?? maintenanceStatusFilter;
      const unit = unitFilter ?? maintenanceUnitFilter;
      
      // Build query parameters
      const params = new URLSearchParams();
      if (status !== "ALL") {
        params.append("status", status.toLowerCase());
      }
      if (unit !== "all") {
        params.append("unit", unit);
      }
      
      const queryString = params.toString();
      const endpoint = `/properties/${propertyId}/maintenance${queryString ? `?${queryString}` : ""}`;
      
      const data = await apiFetch<MaintenanceRequest[]>(endpoint, { auth: true });
      setMaintenance(data);
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : "Failed to load maintenance requests");
    } finally {
      setMaintenanceLoading(false);
    }
  }, [propertyId, maintenanceStatusFilter, maintenanceUnitFilter]);

  useEffect(() => {
    if (propertyId) {
      void loadUnits();
      void loadMaintenance();
    }
  }, [propertyId, loadUnits, loadMaintenance]);

  const loadTenants = async () => {
    setTenantsLoading(true);
    try {
      const data = await apiFetch<Tenant[]>("/tenants", { auth: true });
      setTenants(data);
    } finally {
      setTenantsLoading(false);
    }
  };

  const loadLeaseHistory = useCallback(async () => {
    try {
      const data = await apiFetch<Lease[]>(`/leases?propertyId=${propertyId}`, { auth: true });
      setLeaseHistory(data);
    } catch {
      setLeaseHistory([]);
    }
  }, [propertyId]);

  const loadForecast = useCallback(async () => {
    setForecastError(null);
    try {
      const data = await apiFetch<PropertyForecast>(
        `/api/analytics/forecast?property_id=${propertyId}&time_range=monthly`,
        { auth: true }
      );
      setForecast(data);
    } catch (err) {
      setForecast(null);
      setForecastError(err instanceof Error ? err.message : "Unable to load forecast");
    }
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    void loadLeaseHistory();
    void loadForecast();
  }, [propertyId, loadLeaseHistory, loadForecast]);

  const relationshipSnapshot = useMemo(() => {
    const unitCount = units.length;
    const activeLeases = leaseHistory.filter((lease) => lease.status === "ACTIVE");
    const endedLeases = leaseHistory.filter((lease) => lease.status === "ENDED");
    const tenantIds = new Set(
      leaseHistory
        .map((lease) => lease.tenant?.id ?? lease.tenantId)
        .filter((tenantId): tenantId is string => Boolean(tenantId))
    );
    const openMaintenance = maintenance.filter((request) => request.status !== "COMPLETED");
    const latestProjection = forecast?.projection?.[0] ?? null;

    return {
      unitCount,
      activeLeaseCount: activeLeases.length,
      endedLeaseCount: endedLeases.length,
      tenantCount: tenantIds.size,
      openMaintenanceCount: openMaintenance.length,
      latestProjection,
      forecastConfidence: forecast?.confidence ?? null
    };
  }, [units, leaseHistory, maintenance, forecast]);

  const activeUnitWorkspace = useMemo(
    () => units.find((unit) => unit.id === activeUnitWorkspaceId) ?? null,
    [units, activeUnitWorkspaceId]
  );

  const activeUnitLeaseHistory = useMemo(() => {
    if (!activeUnitWorkspace) return [];
    return leaseHistory.filter((lease) => lease.unit?.id === activeUnitWorkspace.id);
  }, [activeUnitWorkspace, leaseHistory]);

  const activeUnitMaintenance = useMemo(() => {
    if (!activeUnitWorkspace) return [];
    return maintenance.filter((request) => request.unit?.id === activeUnitWorkspace.id);
  }, [activeUnitWorkspace, maintenance]);

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
      setShowEditPropertyModal(false);
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
      setError(friendlyError(err, "Failed to delete property"));
    } finally {
      setLoading(false);
    }
  };

  const deactivateUnit = async (unitId: string) => {
    if (!confirm("Deactivate this unit?")) return;
    setUnitsError(null);
    try {
      await apiFetch(`/units/${unitId}/deactivate`, { method: "PATCH", auth: true });
      await loadUnits();
    } catch (err: unknown) {
      const code = (err as { code?: string; message?: string })?.code;
      if (code === "UNIT_HAS_ACTIVE_LEASE") {
        setUnitsError("This unit has an active lease. End the lease first before deactivating.");
        return;
      }
      setUnitsError(friendlyError(err, "Failed to deactivate unit"));
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

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const confirmEndLease = async () => {
    if (!endLeaseUnit?.currentLease) return;
    setEndLeaseLoading(true);
    setUnitsError(null);
    try {
      await apiFetch(`/leases/${endLeaseUnit.currentLease.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ status: "ENDED" })
      });
      setEndLeaseUnit(null);
      await loadUnits();
      showToast("Lease ended. Unit is now vacant.");
    } catch (err) {
      setUnitsError(friendlyError(err, "Failed to end lease"));
      setEndLeaseUnit(null);
    } finally {
      setEndLeaseLoading(false);
    }
  };

  const openEditUnit = (unit: UnitWithLease) => {
    setEditUnit(unit);
    setEditUnitForm({
      label: unit.label,
      bedrooms: unit.bedrooms != null ? String(unit.bedrooms) : "",
      bathrooms: unit.bathrooms != null ? String(unit.bathrooms) : "",
      squareFeet: unit.squareFeet != null ? String(unit.squareFeet) : "",
      rent: unit.rent != null ? String(unit.rent) : ""
    });
    setEditUnitError(null);
  };

  const submitEditUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editUnit) return;
    setEditUnitSaving(true);
    setEditUnitError(null);

    const patch: Record<string, unknown> = {};
    if (editUnitForm.label !== editUnit.label) patch.label = editUnitForm.label;
    const beds = editUnitForm.bedrooms !== "" ? Number(editUnitForm.bedrooms) : null;
    if (beds !== (editUnit.bedrooms ?? null)) patch.bedrooms = beds ?? undefined;
    const baths = editUnitForm.bathrooms !== "" ? Number(editUnitForm.bathrooms) : null;
    if (baths !== (editUnit.bathrooms ?? null)) patch.bathrooms = baths ?? undefined;
    const sqft = editUnitForm.squareFeet !== "" ? Number(editUnitForm.squareFeet) : null;
    if (sqft !== (editUnit.squareFeet ?? null)) patch.squareFeet = sqft ?? undefined;
    const rent = editUnitForm.rent !== "" ? Number(editUnitForm.rent) : null;
    if (rent !== (editUnit.rent ?? null)) patch.rent = rent ?? undefined;

    if (Object.keys(patch).length === 0) {
      setEditUnit(null);
      return;
    }

    try {
      await apiFetch(`/units/${editUnit.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(patch)
      });
      setEditUnit(null);
      await loadUnits();
      showToast("Unit updated.");
    } catch (err) {
      setEditUnitError(err instanceof Error ? err.message : "Failed to update unit");
    } finally {
      setEditUnitSaving(false);
    }
  };

  const openEditLease = async (lease: Lease) => {
    setEditLease(lease);
    setEditLeaseForm({
      rent: String(lease.rent),
      startDate: lease.startDate,
      endDate: lease.endDate ?? "",
      status: lease.status,
      tenantId: lease.tenant.id,
      isMonthToMonth: !lease.endDate
    });
    setEditLeaseError(null);
    setEditLeaseFieldErrors({});
    await loadTenants();
  };

  const submitEditLease = async (event: FormEvent, retryCount = 0) => {
    event.preventDefault();
    if (!editLease) return;
    setEditLeaseSaving(true);
    setEditLeaseError(null);
    setEditLeaseFieldErrors({});

    const fieldErrors: Record<string, string> = {};
    const patch: Record<string, unknown> = {};
    const newRent = Number(editLeaseForm.rent);
    const newStatus = editLeaseForm.status as "DRAFT" | "ACTIVE" | "ENDED";
    const newTenantId = editLeaseForm.tenantId;
    
    // Field validation
    if (!editLeaseForm.rent || newRent <= 0) {
      fieldErrors.rent = "Rent must be a positive number";
    }
    
    if (!editLeaseForm.startDate) {
      fieldErrors.startDate = "Start date is required";
    } else {
      // Past date validation - startDate cannot be more than 30 days in the past
      const startDate = new Date(editLeaseForm.startDate);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Allow current lease's existing startDate (grandfathering)
      if (startDate < thirtyDaysAgo && editLeaseForm.startDate !== editLease.startDate) {
        fieldErrors.startDate = "Start date cannot be more than 30 days in the past";
      }
    }
    
    if (!newTenantId) {
      fieldErrors.tenantId = "Please select a tenant";
    }
    
    // Check month-to-month logic
    if (editLeaseForm.isMonthToMonth) {
      patch.endDate = null;
    } else if (editLeaseForm.endDate) {
      patch.endDate = editLeaseForm.endDate;
    }
    
    if (Object.keys(fieldErrors).length > 0) {
      setEditLeaseFieldErrors(fieldErrors);
      setEditLeaseSaving(false);
      return;
    }

    // Build patches
    if (newRent !== editLease.rent) patch.rent = newRent;
    if (editLeaseForm.startDate !== editLease.startDate) patch.startDate = editLeaseForm.startDate;
    if (newTenantId !== editLease.tenant.id) patch.tenantId = newTenantId;
    if (newStatus !== editLease.status) patch.status = newStatus;
    
    if (!editLeaseForm.isMonthToMonth && editLeaseForm.endDate !== (editLease.endDate ?? "")) {
      patch.endDate = editLeaseForm.endDate || null;
    }

    // Check for significant rent increase (>10%)
    const rentIncrease = ((newRent - editLease.rent) / editLease.rent) * 100;
    if (rentIncrease > 10) {
      if (!confirm(`Warning: This represents a ${rentIncrease.toFixed(1)}% rent increase. This may require tenant notification per local regulations. Continue?`)) {
        setEditLeaseSaving(false);
        return;
      }
    }

    if (Object.keys(patch).length === 0) {
      setEditLease(null);
      setEditLeaseSaving(false);
      return;
    }

    try {
      await apiFetch(`/leases/${editLease.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(patch)
      });
      setEditLease(null);
      await loadUnits();
      showToast("Lease updated.");
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string; details?: unknown };
      
      // Handle specific API errors with inline field errors
      if (error.code === "LEASE_DATE_OVERLAP") {
        const details = error.details as { message?: string; overlappingDates?: string } | undefined;
        setEditLeaseFieldErrors({
          startDate: details?.message || "Date conflicts with existing lease",
          endDate: details?.overlappingDates ? `Conflicts with lease from ${details.overlappingDates}` : ""
        });
      } else if (error.code === "TENANT_NOT_FOUND") {
        setEditLeaseFieldErrors({
          tenantId: "Selected tenant not found or not accessible in your organization"
        });
      } else if (error.message?.includes("network") && retryCount < 2) {
        // Retry mechanism for network failures
        setTimeout(() => submitEditLease(event, retryCount + 1), 1000);
        return;
      } else {
        setEditLeaseError(error.message || "Failed to update lease");
      }
    } finally {
      setEditLeaseSaving(false);
    }
  };

  const openMaintenanceForm = (unitId?: string) => {
    setMaintenanceForm({
      title: "",
      description: "",
      scope: unitId ? "unit" : "property",
      unitId: unitId ?? "",
      cost: ""
    });
    setMaintenanceFormError(null);
    setShowMaintenanceForm(true);
  };

  const openUnitWorkspace = (unitId: string) => {
    setActiveUnitWorkspaceId(unitId);
    setWorkspaceDataError(null);
    setDocUploadError(null);
    setCashflowActionError(null);
  };

  const closeUnitWorkspace = () => {
    setUnitWorkspaceOpen(false);
    setTimeout(() => {
      setActiveUnitWorkspaceId(null);
      setWorkspaceCashflow(null);
      setWorkspaceDocs([]);
      setDocUploadFile(null);
      setDocUploadName("");
      setDocUploadLeaseId("");
    }, 260);
  };

  useEffect(() => {
    if (!activeUnitWorkspaceId) {
      setUnitWorkspaceOpen(false);
      return;
    }
    const timer = setTimeout(() => setUnitWorkspaceOpen(true), 20);
    return () => clearTimeout(timer);
  }, [activeUnitWorkspaceId]);

  useEffect(() => {
    if (!activeUnitWorkspaceId) return;

    const leaseIds = new Set(activeUnitLeaseHistory.map((lease) => lease.id));

    const loadWorkspaceData = async () => {
      setWorkspaceDataLoading(true);
      setWorkspaceDataError(null);
      try {
        const [cashflow, docs] = await Promise.all([
          apiFetch<UnitCashflow>(`/units/${activeUnitWorkspaceId}/cashflow?timeframe=${cashflowTimeframe}`, { auth: true }),
          apiFetch<DocumentRecord[]>(`/api/documents?propertyId=${propertyId}`, { auth: true })
        ]);

        setWorkspaceCashflow(cashflow);
        setWorkspaceDocs(docs.filter((doc) => !!doc.leaseId && leaseIds.has(doc.leaseId)));
      } catch (err) {
        setWorkspaceDataError(err instanceof Error ? err.message : "Failed to load workspace data");
      } finally {
        setWorkspaceDataLoading(false);
      }
    };

    void loadWorkspaceData();
  }, [activeUnitWorkspaceId, activeUnitLeaseHistory, propertyId, cashflowTimeframe]);

  useEffect(() => {
    if (!activeUnitWorkspace?.currentLease?.id) {
      setDocUploadLeaseId("");
      return;
    }
    setDocUploadLeaseId(activeUnitWorkspace.currentLease.id);
  }, [activeUnitWorkspace]);

  const uploadUnitDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!docUploadFile) {
      setDocUploadError("Please choose a file.");
      return;
    }

    setDocUploading(true);
    setDocUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", docUploadFile);
      formData.append("propertyId", propertyId);
      formData.append("type", docUploadType);
      if (docUploadName.trim()) {
        formData.append("name", docUploadName.trim());
      }
      if (docUploadLeaseId) {
        formData.append("leaseId", docUploadLeaseId);
      }

      await apiFetch<{ document: DocumentRecord }>("/api/documents/upload", {
        method: "POST",
        auth: true,
        body: formData
      });

      setDocUploadFile(null);
      setDocUploadName("");
      showToast("Document uploaded.");

      if (activeUnitWorkspaceId) {
        const leaseIds = new Set(activeUnitLeaseHistory.map((lease) => lease.id));
        const docs = await apiFetch<DocumentRecord[]>(`/api/documents?propertyId=${propertyId}`, { auth: true });
        setWorkspaceDocs(docs.filter((doc) => !!doc.leaseId && leaseIds.has(doc.leaseId)));
      }
    } catch (err) {
      setDocUploadError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setDocUploading(false);
    }
  };

  const renameWorkspaceDocument = async (docId: string) => {
    const nextName = docRenamingValue.trim();
    if (!nextName) {
      setDocUploadError("Document name cannot be empty.");
      return;
    }

    try {
      await apiFetch(`/api/documents/${docId}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ name: nextName })
      });

      setWorkspaceDocs((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, name: nextName } : doc)));
      setDocRenamingId(null);
      setDocRenamingValue("");
      showToast("Document renamed.");
    } catch (err) {
      setDocUploadError(err instanceof Error ? err.message : "Failed to rename document");
    }
  };

  const deleteWorkspaceDocument = async (docId: string) => {
    setDocDeleteBusyId(docId);
    setDocUploadError(null);
    try {
      await apiFetch(`/api/documents/${docId}`, {
        method: "DELETE",
        auth: true
      });
      setWorkspaceDocs((prev) => prev.filter((doc) => doc.id !== docId));
      showToast("Document removed.");
    } catch (err) {
      setDocUploadError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDocDeleteBusyId(null);
    }
  };

  const markPaymentPaid = async (paymentId: string) => {
    if (!activeUnitWorkspaceId) return;
    setCashflowActionBusyId(paymentId);
    setCashflowActionError(null);
    try {
      await apiFetch(`/units/${activeUnitWorkspaceId}/cashflow/payments/${paymentId}/mark-paid`, {
        method: "POST",
        auth: true
      });
      const cashflow = await apiFetch<UnitCashflow>(
        `/units/${activeUnitWorkspaceId}/cashflow?timeframe=${cashflowTimeframe}`,
        { auth: true }
      );
      setWorkspaceCashflow(cashflow);
      showToast("Payment marked as paid.");
    } catch (err) {
      setCashflowActionError(err instanceof Error ? err.message : "Failed to mark payment paid");
    } finally {
      setCashflowActionBusyId(null);
    }
  };

  const remindPayment = async (paymentId: string) => {
    if (!activeUnitWorkspaceId) return;
    setCashflowActionBusyId(paymentId);
    setCashflowActionError(null);
    try {
      await apiFetch(`/units/${activeUnitWorkspaceId}/cashflow/payments/${paymentId}/remind`, {
        method: "POST",
        auth: true
      });
      showToast("Reminder logged.");
    } catch (err) {
      setCashflowActionError(err instanceof Error ? err.message : "Failed to log reminder");
    } finally {
      setCashflowActionBusyId(null);
    }
  };

  const submitMaintenanceRequest = async (event: FormEvent) => {
    event.preventDefault();
    setMaintenanceFormSaving(true);
    setMaintenanceFormError(null);

    if (!maintenanceForm.title) {
      setMaintenanceFormError("Title is required");
      setMaintenanceFormSaving(false);
      return;
    }

    if (maintenanceForm.scope === "unit" && !maintenanceForm.unitId) {
      setMaintenanceFormError("Please select a unit for unit-specific requests");
      setMaintenanceFormSaving(false);
      return;
    }

    try {
      await apiFetch(`/properties/${propertyId}/maintenance`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          unitId: maintenanceForm.scope === "unit" ? maintenanceForm.unitId : null,
          title: maintenanceForm.title,
          description: maintenanceForm.description || null,
          cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : null
        })
      });
      setShowMaintenanceForm(false);
      await loadMaintenance(); // Refresh with current filters
      showToast("Maintenance request created.");
    } catch (err) {
      setMaintenanceFormError(err instanceof Error ? err.message : "Failed to create maintenance request");
    } finally {
      setMaintenanceFormSaving(false);
    }
  };

  // Calculate active lease count
  useEffect(() => {
    const activeLeases = units.filter(unit => 
      unit.currentLease && unit.currentLease.status === "ACTIVE"
    ).length;
    setActiveLeaseCount(activeLeases);
  }, [units]);

  const handleArchiveProperty = async () => {
    if (!form) return;
    
    setArchiveLoading(true);
    setError(null);
    
    try {
      const endpoint = form.archivedAt 
        ? `/properties/${propertyId}/unarchive`
        : `/properties/${propertyId}/archive`;
      
      await apiFetch(endpoint, { 
        method: "POST", 
        auth: true 
      });
      
      // Refresh property data
      const data = await apiFetch<Property>(`/properties/${propertyId}`, { auth: true });
      setForm(data);
      
      const action = form.archivedAt ? "unarchived" : "archived";
      showToast(`Property ${action} successfully.`);
      
      setShowArchiveModal(false);
    } catch (err: unknown) {
      const code = (err as { code?: string; message?: string })?.code;
      if (code === "PROPERTY_HAS_ACTIVE_LEASES") {
        setError("Cannot archive property with active leases. End all leases first.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to archive property.");
      }
    } finally {
      setArchiveLoading(false);
    }
  };

  if (!form) {
    return <p className="text-sm text-slate-400">Loading property...</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold">{form.name}</h2>
            {form.archivedAt && (
              <span className="rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Archived
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">Run daily unit and tenant operations from the unit workspace.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowEditPropertyModal(true)}>
            Edit Property
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowArchiveModal(true)}
            disabled={loading || archiveLoading}
          >
            {form.archivedAt ? "Unarchive" : "Archive"}
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={loading}>
            Delete
          </Button>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Property Overview</p>
        <p className="mt-2 text-sm text-slate-200">
          {form.addressLine1}
          {form.addressLine2 ? `, ${form.addressLine2}` : ""}, {form.city}, {form.state} {form.postalCode} {form.country}
        </p>
        {form.notes ? <p className="mt-2 text-sm text-slate-400">{form.notes}</p> : null}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-800/70 bg-slate-950/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Relationship Snapshot</h3>
            <p className="text-sm text-slate-400">
              Property &rarr; Units &rarr; Leases &rarr; Tenants &rarr; Maintenance
            </p>
          </div>
          {relationshipSnapshot.forecastConfidence !== null && (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              AI confidence {(relationshipSnapshot.forecastConfidence * 100).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Units</p>
            <p className="mt-2 text-2xl font-semibold">{relationshipSnapshot.unitCount}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Leases</p>
            <p className="mt-2 text-2xl font-semibold">{relationshipSnapshot.activeLeaseCount}</p>
            <p className="text-xs text-slate-400">Active</p>
            <p className="text-xs text-slate-500">{relationshipSnapshot.endedLeaseCount} ended</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Tenants</p>
            <p className="mt-2 text-2xl font-semibold">{relationshipSnapshot.tenantCount}</p>
            <p className="text-xs text-slate-400">Across active and past leases</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Maintenance</p>
            <p className="mt-2 text-2xl font-semibold">{relationshipSnapshot.openMaintenanceCount}</p>
            <p className="text-xs text-slate-400">Open requests</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">AI Net Forecast</p>
            <p className="mt-2 text-2xl font-semibold">
              {relationshipSnapshot.latestProjection
                ? formatCurrency(relationshipSnapshot.latestProjection.net)
                : "—"}
            </p>
            <p className="text-xs text-slate-400">Next projected period</p>
          </div>
        </div>

        {forecastError && <p className="mt-3 text-xs text-amber-300">{forecastError}</p>}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Units</h3>
            <p className="text-sm text-slate-400">Track occupancy and assign tenants.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowPropertyMaintenancePanel((current) => !current)}>
              {showPropertyMaintenancePanel ? "Hide Maintenance" : "View All Maintenance"}
            </Button>
            <Button onClick={openAddUnit}>Add Unit</Button>
          </div>
        </div>

        {unitsError && <p className="mt-4 text-sm text-rose-300">{unitsError}</p>}
        {successMessage && <p className="mt-4 text-sm text-emerald-300">{successMessage}</p>}

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
                  <Button onClick={() => openUnitWorkspace(unit.id)}>
                    Open Unit Workspace
                  </Button>
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

      {showPropertyMaintenancePanel && (
      <section className="mt-8 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Property Maintenance</h3>
            <p className="text-sm text-slate-400">Track maintenance requests and work orders.</p>
          </div>
          <Button onClick={() => openMaintenanceForm()}>Create Request</Button>
        </div>

        {maintenanceError && <p className="mt-4 text-sm text-rose-300">{maintenanceError}</p>}

        <div className="mt-6">
          {/* Filter Controls */}
          <div className="mb-6 space-y-4 rounded-xl border border-slate-800/70 bg-slate-900/50 p-3 md:p-4">
            {/* Unit Filter Dropdown */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Filter by Unit</label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-slate-100 text-sm md:w-auto md:min-w-[220px]"
                value={maintenanceUnitFilter}
                onChange={(e) => {
                  const newFilter = e.target.value;
                  setMaintenanceUnitFilter(newFilter);
                  void loadMaintenance(maintenanceStatusFilter, newFilter);
                }}
              >
                <option value="all">All Units</option>
                <option value="property">Property-wide Only</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Status Filter Buttons */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Filter by Status</label>
              <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
                {(["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as const).map((status) => (
                  <button
                    key={status}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
                      maintenanceStatusFilter === status
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-700/70 text-slate-300"
                    }`}
                    onClick={() => {
                      setMaintenanceStatusFilter(status);
                      void loadMaintenance(status, maintenanceUnitFilter);
                    }}
                  >
                    {status.replace("_", " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {maintenanceLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`maintenance-loading-${index}`}
                  className="h-24 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-950/40"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Client-side filtering is no longer needed since API handles filtering
                // But we still separate for display organization
                const propertyWideMaintenance = maintenance.filter(req => !req.unit);
                const unitSpecificMaintenance = maintenance.filter(req => !!req.unit);

                if (maintenance.length === 0) {
                  const filterDescription = [];
                  if (maintenanceStatusFilter !== "ALL") {
                    filterDescription.push(`status "${maintenanceStatusFilter.replace("_", " ").toLowerCase()}"`); 
                  }
                  if (maintenanceUnitFilter === "property") {
                    filterDescription.push("property-wide only");
                  } else if (maintenanceUnitFilter !== "all") {
                    const unit = units.find(u => u.id === maintenanceUnitFilter);
                    if (unit) {
                      filterDescription.push(`unit "${unit.label}" only`);
                    }
                  }
                  
                  return (
                    <div className="text-center py-8 text-slate-400">
                      No maintenance requests {filterDescription.length > 0 ? `with ${filterDescription.join(" and ")}` : ""} found.
                    </div>
                  );
                }

                return (
                  <div className="space-y-8">
                    {propertyWideMaintenance.length > 0 && maintenanceUnitFilter !== "property" && (
                      <div>
                        <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
                          Property-wide
                          <span className="text-sm font-normal text-slate-400">({propertyWideMaintenance.length})</span>
                        </h4>
                        <div className="grid gap-4">
                          {propertyWideMaintenance.map((request) => (
                            <div
                              key={request.id}
                              className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h5 className="text-lg font-semibold">{request.title}</h5>
                                  {request.description && (
                                    <p className="mt-2 text-sm text-slate-300">{request.description}</p>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                                    <span>Created: {formatDate(request.createdAt)}</span>
                                    {request.cost && (
                                      <span>Cost: {formatCurrency(request.cost)}</span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                    request.status === "COMPLETED"
                                      ? "bg-emerald-500/20 text-emerald-200"
                                      : request.status === "IN_PROGRESS"
                                      ? "bg-yellow-500/20 text-yellow-200"
                                      : "bg-slate-800/70 text-slate-300"
                                  }`}
                                >
                                  {request.status.replace("_", " ")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {unitSpecificMaintenance.length > 0 && maintenanceUnitFilter === "all" && (
                      <div>
                        <h4 className="text-lg font-medium mb-4 flex items-center gap-2">
                          Unit-specific
                          <span className="text-sm font-normal text-slate-400">({unitSpecificMaintenance.length})</span>
                        </h4>
                        <div className="grid gap-4">
                          {unitSpecificMaintenance.map((request) => (
                            <div
                              key={request.id}
                              className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-5"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h5 className="text-lg font-semibold">{request.title}</h5>
                                  {request.description && (
                                    <p className="mt-2 text-sm text-slate-300">{request.description}</p>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                                    <span className="font-medium text-slate-300">Unit: {request.unit?.label}</span>
                                    <span>Created: {formatDate(request.createdAt)}</span>
                                    {request.tenant && (
                                      <span>Tenant: {request.tenant.firstName} {request.tenant.lastName}</span>
                                    )}
                                    {request.cost && (
                                      <span>Cost: {formatCurrency(request.cost)}</span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                    request.status === "COMPLETED"
                                      ? "bg-emerald-500/20 text-emerald-200"
                                      : request.status === "IN_PROGRESS"
                                      ? "bg-yellow-500/20 text-yellow-200"
                                      : "bg-slate-800/70 text-slate-300"
                                  }`}
                                >
                                  {request.status.replace("_", " ")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>
      )}

      {showEditPropertyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700/70 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Edit Property Details</h4>
              <button
                type="button"
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowEditPropertyModal(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
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

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowEditPropertyModal(false)}>
                  Cancel
                </Button>
                <Button disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeUnitWorkspace && (
        <div
          className={`fixed inset-0 z-50 flex justify-end bg-slate-950/80 transition-opacity duration-300 ${
            unitWorkspaceOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeUnitWorkspace}
        >
          <div
            className={`h-full w-full max-w-2xl overflow-y-auto border-l border-slate-700/70 bg-slate-950/95 p-4 md:p-6 shadow-2xl transition-all duration-300 ease-out ${
              unitWorkspaceOpen ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/95 px-4 pb-3 pt-1 md:-mx-6 md:px-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Unit Workspace</p>
                <h4 className="text-xl font-semibold">{activeUnitWorkspace.label}</h4>
                <p className="text-sm text-slate-400">
                  {activeUnitWorkspace.bedrooms ?? "—"} bd • {activeUnitWorkspace.bathrooms ?? "—"} ba • {activeUnitWorkspace.squareFeet ?? "—"} sqft
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={closeUnitWorkspace}
              >
                Close
              </button>
            </div>

            {workspaceDataError && <p className="mt-3 text-sm text-rose-300">{workspaceDataError}</p>}

            <div className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Current Tenancy</p>
              {activeUnitWorkspace.currentLease ? (
                <>
                  <p className="mt-2 text-base text-slate-100">
                    {activeUnitWorkspace.currentLease.tenant.firstName} {activeUnitWorkspace.currentLease.tenant.lastName}
                  </p>
                  <p className="text-sm text-slate-400">
                    {formatDate(activeUnitWorkspace.currentLease.startDate)} &rarr; {formatDate(activeUnitWorkspace.currentLease.endDate)}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">Rent: {formatCurrency(activeUnitWorkspace.currentLease.rent)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openEditLease(activeUnitWorkspace.currentLease!)}>
                      Edit Lease
                    </Button>
                    <Button variant="destructive" onClick={() => setEndLeaseUnit(activeUnitWorkspace)}>
                      End Lease
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-400">No active lease. Assign a tenant to start operations.</p>
                  <div className="mt-3">
                    <Button onClick={() => openLeaseFlow(activeUnitWorkspace)}>Assign Tenant</Button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Unit Cashflow</p>
                <div className="flex w-full gap-1 overflow-x-auto pb-1 sm:w-auto">
                  {([
                    { key: "30d", label: "30d" },
                    { key: "90d", label: "90d" },
                    { key: "12m", label: "12m" },
                    { key: "all", label: "All" }
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                        cashflowTimeframe === option.key
                          ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                          : "border-slate-700/70 text-slate-300"
                      }`}
                      onClick={() => setCashflowTimeframe(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {workspaceDataLoading ? (
                <p className="mt-3 text-sm text-slate-400">Loading cashflow...</p>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Collected</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-200">
                        {formatCurrency(workspaceCashflow?.summary.collected ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p>
                      <p className="mt-1 text-lg font-semibold text-amber-200">
                        {formatCurrency(workspaceCashflow?.summary.outstanding ?? 0)}
                      </p>
                    </div>
                  </div>

                  {cashflowActionError && <p className="mt-3 text-sm text-rose-300">{cashflowActionError}</p>}

                  <div className="mt-3 space-y-2">
                    {(workspaceCashflow?.recentPayments ?? []).slice(0, 5).map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-100">{payment.tenant ?? "Tenant"}</p>
                            <p className="text-xs text-slate-400">Due {formatDate(payment.dueDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-100">{formatCurrency(payment.amount)}</p>
                            <p className="text-xs text-slate-400">{payment.status}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                          {payment.status !== "PAID" && (
                            <Button
                              variant="secondary"
                              onClick={() => markPaymentPaid(payment.id)}
                              disabled={cashflowActionBusyId === payment.id}
                            >
                              Mark Paid
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => remindPayment(payment.id)}
                            disabled={cashflowActionBusyId === payment.id}
                          >
                            Remind
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(workspaceCashflow?.recentPayments?.length ?? 0) === 0 && (
                      <p className="text-sm text-slate-400">No payment history for this unit yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Lease History</p>
                <Button variant="secondary" onClick={() => openEditUnit(activeUnitWorkspace)}>
                  Edit Unit
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {activeUnitLeaseHistory.length === 0 ? (
                  <p className="text-sm text-slate-400">No past leases for this unit yet.</p>
                ) : (
                  activeUnitLeaseHistory.map((lease) => (
                    <div key={lease.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                      <p className="text-sm text-slate-200">
                        {lease.tenant.firstName} {lease.tenant.lastName} • {lease.status}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(lease.startDate)} &rarr; {formatDate(lease.endDate)} • {formatCurrency(lease.rent)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Maintenance for this Unit</p>
                <Button onClick={() => openMaintenanceForm(activeUnitWorkspace.id)}>Create Request</Button>
              </div>
              <div className="mt-3 space-y-2">
                {activeUnitMaintenance.length === 0 ? (
                  <p className="text-sm text-slate-400">No maintenance requests for this unit.</p>
                ) : (
                  activeUnitMaintenance.map((request) => (
                    <div key={request.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-100">{request.title}</p>
                          <p className="text-xs text-slate-400">{formatDate(request.createdAt)}</p>
                          {request.cost ? <p className="text-xs text-slate-400">Cost: {formatCurrency(request.cost)}</p> : null}
                        </div>
                        <span className="rounded-full bg-slate-800/70 px-2 py-1 text-xs text-slate-300">
                          {request.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Documents</p>

              <form onSubmit={uploadUnitDocument} className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Type</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={docUploadType}
                    onChange={(event) => setDocUploadType(event.target.value)}
                  >
                    <option value="LEASE">Lease</option>
                    <option value="INSPECTION">Inspection</option>
                    <option value="RECEIPT">Receipt</option>
                    <option value="INSURANCE">Insurance</option>
                    <option value="TAX">Tax</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Lease Link</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={docUploadLeaseId}
                    onChange={(event) => setDocUploadLeaseId(event.target.value)}
                  >
                    <option value="">No lease link</option>
                    {activeUnitLeaseHistory.map((lease) => (
                      <option key={lease.id} value={lease.id}>
                        {lease.tenant.firstName} {lease.tenant.lastName} ({lease.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Display Name (optional)</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={docUploadName}
                    onChange={(event) => setDocUploadName(event.target.value)}
                    placeholder="Lease Addendum - Unit 2A"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">File</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    type="file"
                    onChange={(event) => setDocUploadFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                {docUploadError && <p className="md:col-span-2 text-sm text-rose-300">{docUploadError}</p>}
                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={docUploading}>{docUploading ? "Uploading..." : "Upload Document"}</Button>
                </div>
              </form>

              <div className="mt-4 space-y-2">
                {workspaceDocs.length === 0 ? (
                  <p className="text-sm text-slate-400">No lease-linked documents for this unit yet.</p>
                ) : (
                  workspaceDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3"
                    >
                      {docRenamingId === doc.id ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                            value={docRenamingValue}
                            onChange={(event) => setDocRenamingValue(event.target.value)}
                          />
                          <Button variant="secondary" onClick={() => renameWorkspaceDocument(doc.id)}>
                            Save
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setDocRenamingId(null);
                              setDocRenamingValue("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 hover:text-cyan-200"
                          >
                            <p className="truncate text-sm text-slate-100">{doc.name}</p>
                            <p className="text-xs text-slate-400">{doc.type} • {formatDate(doc.createdAt)}</p>
                          </a>
                          <div className="flex gap-2 self-start">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setDocRenamingId(doc.id);
                                setDocRenamingValue(doc.name);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => deleteWorkspaceDocument(doc.id)}
                              disabled={docDeleteBusyId === doc.id}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal dialogs */}
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

      {endLeaseUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <h4 className="text-lg font-semibold">End Lease</h4>
            <p className="mt-3 text-sm text-slate-300">
              End lease for{" "}
              <span className="font-semibold text-slate-100">
                {endLeaseUnit.currentLease?.tenant.firstName} {endLeaseUnit.currentLease?.tenant.lastName}
              </span>
              ? This cannot be undone without re-creating a lease.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEndLeaseUnit(null)}
                disabled={endLeaseLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmEndLease()}
                disabled={endLeaseLoading}
              >
                {endLeaseLoading ? "Ending..." : "End Lease"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Edit Unit</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setEditUnit(null)}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitEditUnit} className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Label</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editUnitForm.label}
                  onChange={(event) => setEditUnitForm((prev) => ({ ...prev, label: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Beds</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editUnitForm.bedrooms}
                  onChange={(event) => setEditUnitForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Baths</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editUnitForm.bathrooms}
                  onChange={(event) => setEditUnitForm((prev) => ({ ...prev, bathrooms: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.5"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Sqft</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editUnitForm.squareFeet}
                  onChange={(event) => setEditUnitForm((prev) => ({ ...prev, squareFeet: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Monthly Rent</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editUnitForm.rent}
                  onChange={(event) => setEditUnitForm((prev) => ({ ...prev, rent: event.target.value }))}
                  type="number"
                  min="0"
                />
              </div>

              {editUnitError && <p className="md:col-span-2 text-sm text-rose-300">{editUnitError}</p>}

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setEditUnit(null)}>
                  Cancel
                </Button>
                <Button disabled={editUnitSaving}>
                  {editUnitSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Edit Lease #{editLease.id}</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setEditLease(null)}
              >
                Close
              </button>
            </div>

            <form onSubmit={(e) => submitEditLease(e)} className="mt-4 grid gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Tenant</label>
                <select
                  className={`mt-2 w-full rounded-xl border ${editLeaseFieldErrors.tenantId ? 'border-rose-500' : 'border-slate-700'} bg-slate-950/60 px-4 py-3 text-slate-100`}
                  value={editLeaseForm.tenantId}
                  onChange={(event) => {
                    setEditLeaseForm((prev) => ({ ...prev, tenantId: event.target.value }));
                    setEditLeaseFieldErrors((prev) => ({ ...prev, tenantId: "" }));
                  }}
                  disabled={tenantsLoading}
                  required
                >
                  <option value="">Select tenant...</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.firstName} {tenant.lastName} {tenant.email ? `(${tenant.email})` : ''}
                    </option>
                  ))}
                </select>
                {editLeaseFieldErrors.tenantId && <p className="mt-1 text-xs text-rose-300">{editLeaseFieldErrors.tenantId}</p>}
              </div>
              
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Monthly Rent</label>
                <input
                  className={`mt-2 w-full rounded-xl border ${editLeaseFieldErrors.rent ? 'border-rose-500' : 'border-slate-700'} bg-slate-950/60 px-4 py-3 text-slate-100`}
                  value={editLeaseForm.rent}
                  onChange={(event) => {
                    setEditLeaseForm((prev) => ({ ...prev, rent: event.target.value }));
                    setEditLeaseFieldErrors((prev) => ({ ...prev, rent: "" }));
                  }}
                  type="number"
                  min="0"
                  required
                />
                {editLeaseFieldErrors.rent && <p className="mt-1 text-xs text-rose-300">{editLeaseFieldErrors.rent}</p>}
              </div>
              
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Start Date</label>
                <input
                  className={`mt-2 w-full rounded-xl border ${editLeaseFieldErrors.startDate ? 'border-rose-500' : 'border-slate-700'} bg-slate-950/60 px-4 py-3 text-slate-100`}
                  value={editLeaseForm.startDate}
                  onChange={(event) => {
                    setEditLeaseForm((prev) => ({ ...prev, startDate: event.target.value }));
                    setEditLeaseFieldErrors((prev) => ({ ...prev, startDate: "" }));
                  }}
                  type="date"
                  required
                />
                {editLeaseFieldErrors.startDate && <p className="mt-1 text-xs text-rose-300">{editLeaseFieldErrors.startDate}</p>}
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-xs uppercase tracking-wide text-slate-400">End Date</label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={editLeaseForm.isMonthToMonth}
                      onChange={(event) => {
                        const isMonthToMonth = event.target.checked;
                        setEditLeaseForm((prev) => ({ 
                          ...prev, 
                          isMonthToMonth,
                          endDate: isMonthToMonth ? "" : prev.endDate 
                        }));
                        setEditLeaseFieldErrors((prev) => ({ ...prev, endDate: "" }));
                      }}
                      className="w-4 h-4 text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-500"
                    />
                    Month-to-Month
                  </label>
                </div>
                <input
                  className={`mt-2 w-full rounded-xl border ${editLeaseFieldErrors.endDate ? 'border-rose-500' : 'border-slate-700'} bg-slate-950/60 px-4 py-3 text-slate-100`}
                  value={editLeaseForm.endDate}
                  onChange={(event) => {
                    setEditLeaseForm((prev) => ({ ...prev, endDate: event.target.value }));
                    setEditLeaseFieldErrors((prev) => ({ ...prev, endDate: "" }));
                  }}
                  type="date"
                  disabled={editLeaseForm.isMonthToMonth}
                  placeholder={editLeaseForm.isMonthToMonth ? "Month-to-month lease" : ""}
                />
                {editLeaseFieldErrors.endDate && <p className="mt-1 text-xs text-rose-300">{editLeaseFieldErrors.endDate}</p>}
              </div>
              
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Status</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={editLeaseForm.status}
                  onChange={(event) => setEditLeaseForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  {/* ENDED status removed per PM specification - only valid transitions */}
                </select>
              </div>

              {editLeaseError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <p className="text-sm text-rose-300">{editLeaseError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setEditLease(null)}>
                  Cancel
                </Button>
                <Button disabled={editLeaseSaving}>
                  {editLeaseSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
            
            {/* Enhanced footer with last modified info */}
            <div className="mt-4 pt-4 border-t border-slate-700/50 text-xs text-slate-400">
              <p>Lease ID: {editLease.id}</p>
              <p>Current tenant: {editLease.tenant.firstName} {editLease.tenant.lastName}</p>
              {/* Note: Last modified timestamp would require API enhancement to track modification history */}
            </div>
          </div>
        </div>
      )}

      {showMaintenanceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Create Maintenance Request</h4>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowMaintenanceForm(false)}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitMaintenanceRequest} className="mt-4 grid gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Title</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={maintenanceForm.title}
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                  placeholder="e.g., Fix leaking faucet"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                <textarea
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  rows={3}
                  value={maintenanceForm.description}
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Additional details..."
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Applies To</label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="property"
                      checked={maintenanceForm.scope === "property"}
                      onChange={(e) => setMaintenanceForm((prev) => ({ 
                        ...prev, 
                        scope: e.target.value as "property" | "unit", 
                        unitId: "" 
                      }))}
                      className="w-4 h-4 text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-slate-300">
                      <span className="font-medium">Property-wide</span>
                      <span className="block text-xs text-slate-400">Affects the entire property (e.g., landscaping, roof, HVAC)</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="unit"
                      checked={maintenanceForm.scope === "unit"}
                      onChange={(e) => setMaintenanceForm((prev) => ({ 
                        ...prev, 
                        scope: e.target.value as "property" | "unit"
                      }))}
                      className="w-4 h-4 text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-slate-300">
                      <span className="font-medium">Specific Unit</span>
                      <span className="block text-xs text-slate-400">Affects one unit only (e.g., appliance, plumbing, flooring)</span>
                    </span>
                  </label>
                </div>
              </div>
              {maintenanceForm.scope === "unit" && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Select Unit</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={maintenanceForm.unitId}
                    onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, unitId: event.target.value }))}
                    required={maintenanceForm.scope === "unit"}
                  >
                    <option value="">Choose a unit...</option>
                    {units.map((unit) => {
                      const tenantInfo = unit.currentLease ? 
                        ` • ${unit.currentLease.tenant.firstName} ${unit.currentLease.tenant.lastName}` : 
                        " • Vacant";
                      const unitDetails = [
                        unit.bedrooms ? `${unit.bedrooms}br` : "",
                        unit.bathrooms ? `${unit.bathrooms}ba` : "",
                        unit.squareFeet ? `${unit.squareFeet}sf` : ""
                      ].filter(Boolean).join("/");
                      
                      return (
                        <option key={unit.id} value={unit.id}>
                          {unit.label}{unitDetails ? ` (${unitDetails})` : ""}{tenantInfo}
                        </option>
                      );
                    })}
                  </select>
                  {units.length === 0 && (
                    <p className="mt-2 text-xs text-slate-400">No units available. Add units to the property first.</p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Estimated Cost (Optional)</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  type="number"
                  min="0"
                  step="0.01"
                  value={maintenanceForm.cost}
                  onChange={(event) => setMaintenanceForm((prev) => ({ ...prev, cost: event.target.value }))}
                  placeholder="0.00"
                />
              </div>

              {maintenanceFormError && <p className="text-sm text-rose-300">{maintenanceFormError}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setShowMaintenanceForm(false)}>
                  Cancel
                </Button>
                <Button disabled={maintenanceFormSaving}>
                  {maintenanceFormSaving ? "Creating..." : "Create Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showArchiveModal && form && (
        <ArchiveConfirmModal
          property={{
            id: form.id,
            name: form.name,
            archivedAt: form.archivedAt
          }}
          activeLeaseCount={activeLeaseCount}
          onClose={() => setShowArchiveModal(false)}
          onConfirm={handleArchiveProperty}
        />
      )}
    </div>
  );
}
