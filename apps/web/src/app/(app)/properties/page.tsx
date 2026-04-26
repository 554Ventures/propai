"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building, Home } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { 
  Button, 
  PageHeader,
  PageHeaderAction,
  DataCard,
  DataCardAction,
  PropertyStatusBadge,
  SkeletonCard,
  Text,
  Badge
} from "@/components/ui";
import { ArchiveConfirmModal } from "@/components/ArchiveConfirmModal";

type Property = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  unitCount?: number;
  occupiedCount?: number;
  activeLeaseCount?: number;
  vacancyCount?: number;
  overduePaymentCount?: number;
  openMaintenanceCount?: number;
  expiringLeaseCount30?: number;
  aiPrediction?: {
    label: string;
    reason: string;
    confidence: number;
    priority: "HIGH" | "MEDIUM" | "LOW";
  };
  archivedAt?: string | null;
};

type ListView = "all" | "attention" | "stable";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveModalProperty, setArchiveModalProperty] = useState<Property | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [listView, setListView] = useState<ListView>("all");

  const showToast = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const filteredByArchive = properties.filter((property) => {
    if (showArchived) {
      return !!property.archivedAt;
    }
    return !property.archivedAt;
  });

  const propertyNeedsAttention = (property: Property) => {
    return (
      (property.overduePaymentCount ?? 0) > 0 ||
      (property.expiringLeaseCount30 ?? 0) > 0 ||
      (property.vacancyCount ?? 0) > 0 ||
      (property.openMaintenanceCount ?? 0) > 0
    );
  };

  const filteredProperties = filteredByArchive.filter((property) => {
    if (showArchived) return true;
    if (listView === "attention") return propertyNeedsAttention(property);
    if (listView === "stable") return !propertyNeedsAttention(property);
    return true;
  });

  const activeProperties = properties.filter((property) => !property.archivedAt);
  const attentionCount = activeProperties.filter((property) => propertyNeedsAttention(property)).length;
  const overdueCount = activeProperties.reduce((sum, property) => sum + (property.overduePaymentCount ?? 0), 0);
  const maintenanceOpenCount = activeProperties.reduce(
    (sum, property) => sum + (property.openMaintenanceCount ?? 0),
    0
  );

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

  const handleArchiveAction = async () => {
    if (!archiveModalProperty) return;
    
    setArchiveLoading(true);
    setError(null);
    
    try {
      const endpoint = archiveModalProperty.archivedAt 
        ? `/properties/${archiveModalProperty.id}/unarchive`
        : `/properties/${archiveModalProperty.id}/archive`;
      
      await apiFetch(endpoint, { 
        method: "POST", 
        auth: true 
      });
      
      // Refresh the properties list
      const data = await apiFetch<Property[]>("/properties", { auth: true });
      setProperties(data);
      
      const action = archiveModalProperty.archivedAt ? "unarchived" : "archived";
      showToast(`Property ${action} successfully.`);
      
      setArchiveModalProperty(null);
    } catch (err: unknown) {
      const code = (err as { code?: string; message?: string })?.code;
      if (code === "ACTIVE_LEASES_EXIST") {
        setError("Cannot archive property with active leases. End all leases first.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to archive property.");
      }
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Track portfolio health and take action quickly."
        action={
          <PageHeaderAction.Group>
            <div className="flex gap-2">
              <Badge
                variant={!showArchived ? "default" : "outline"}
                className="cursor-pointer px-4 py-2"
                onClick={() => setShowArchived(false)}
              >
                Active
              </Badge>
              <Badge
                variant={showArchived ? "default" : "outline"}
                className="cursor-pointer px-4 py-2"
                onClick={() => setShowArchived(true)}
              >
                Archived
              </Badge>
            </div>
            <Button asChild>
              <Link href="/properties/new">Add Property</Link>
            </Button>
          </PageHeaderAction.Group>
        }
      />

      {error && <Text variant="error" size="sm" className="mb-4">{error}</Text>}
      {successMessage && <Text variant="success" size="sm" className="mb-4">{successMessage}</Text>}

      {!showArchived && (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <DataCard title="Needs Attention" value={attentionCount} detail="Properties with urgent items" />
          <DataCard title="Overdue Rent" value={overdueCount} detail="Late or past-due payment items" />
          <DataCard title="Open Maintenance" value={maintenanceOpenCount} detail="Pending or in-progress requests" />
        </div>
      )}

      {!showArchived && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge
            variant={listView === "all" ? "default" : "outline"}
            className="cursor-pointer px-4 py-2"
            onClick={() => setListView("all")}
          >
            All
          </Badge>
          <Badge
            variant={listView === "attention" ? "warning" : "outline"}
            className="cursor-pointer px-4 py-2"
            onClick={() => setListView("attention")}
          >
            Attention Needed
          </Badge>
          <Badge
            variant={listView === "stable" ? "success" : "outline"}
            className="cursor-pointer px-4 py-2"
            onClick={() => setListView("stable")}
          >
            Stable
          </Badge>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {loading &&
          Array.from({ length: 2 }).map((_, index) => (
            <SkeletonCard key={`loading-${index}`} className="h-28" />
          ))}
        {filteredProperties.map((property) => (
          <DataCard
            key={property.id}
            title={property.name}
            subtitle={`${property.addressLine1}, ${property.city}, ${property.state} ${property.postalCode}`}
            icon={Building}
            badge={
              property.archivedAt ? (
                <PropertyStatusBadge status="ARCHIVED" size="sm" />
              ) : null
            }
            action={
              <DataCardAction.Button
                onClick={(event) => {
                  event.stopPropagation();
                  setArchiveModalProperty(property);
                }}
                disabled={archiveLoading}
              >
                {property.archivedAt ? "Unarchive" : "Archive"}
              </DataCardAction.Button>
            }
            stats={
              (property.unitCount !== undefined || property.vacancyCount !== undefined) ? [
                {
                  label: "Units",
                  value: property.unitCount ?? 0,
                },
                {
                  label: "Vacant",
                  value: property.vacancyCount ?? 0,
                  variant: property.vacancyCount && property.vacancyCount > 0 ? 'warning' : 'default',
                },
                {
                  label: "Overdue",
                  value: property.overduePaymentCount ?? 0,
                  variant: (property.overduePaymentCount ?? 0) > 0 ? "error" : "default"
                },
                {
                  label: "Open Maint",
                  value: property.openMaintenanceCount ?? 0,
                  variant: (property.openMaintenanceCount ?? 0) > 0 ? "warning" : "default"
                }
              ] : undefined
            }
            footer={
              !property.archivedAt && property.aiPrediction ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      size="sm"
                      variant={
                        property.aiPrediction.priority === "HIGH"
                          ? "error"
                          : property.aiPrediction.priority === "MEDIUM"
                          ? "warning"
                          : "success"
                      }
                    >
                      AI: {property.aiPrediction.label}
                    </Badge>
                    <Text size="xs" variant="muted">
                      {(property.aiPrediction.confidence * 100).toFixed(0)}% confidence
                    </Text>
                  </div>
                  <Text size="xs" variant="muted" className="max-w-[280px]">
                    {property.aiPrediction.reason}
                  </Text>
                </div>
              ) : undefined
            }
            onClick={() => window.location.href = `/properties/${property.id}`}
            variant="interactive"
          />
        ))}

        {filteredProperties.length === 0 && !error && !loading && (
          <div className="md:col-span-2">
            <DataCard
              title={showArchived ? "No archived properties" : "No active properties yet"}
              description={
                showArchived 
                  ? "Archive properties to organize your portfolio."
                  : "Add your first property to begin tracking units and tenants."
              }
              icon={Home}
              variant="ghost"
              action={
                !showArchived ? (
                  <Button asChild>
                    <Link href="/properties/new">Add Property</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {archiveModalProperty && (
        <ArchiveConfirmModal
          property={archiveModalProperty}
          onClose={() => setArchiveModalProperty(null)}
          onConfirm={handleArchiveAction}
        />
      )}
    </div>
  );
}
