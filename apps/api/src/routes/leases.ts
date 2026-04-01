import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";

const router: Router = Router();

const parseDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const activeLeaseWhere = (unitId: string) => {
  const now = new Date();
  return {
    unitId,
    status: "ACTIVE" as const,
    OR: [{ endDate: null }, { endDate: { gt: now } }]
  };
};

router.post(
  "/properties/:propertyId/units/:unitId/leases",
  asyncHandler(async (req, res) => {
    const { tenantId, startDate, endDate, rent, status } = req.body as {
      tenantId?: string;
      startDate?: string;
      endDate?: string | null;
      rent?: number | string;
      status?: "DRAFT" | "ACTIVE" | "ENDED";
    };

    if (!tenantId || !startDate || rent === undefined) {
      sendError(res, 400, "VALIDATION_ERROR", "Missing required lease fields");
      return;
    }

    const parsedStart = parseDate(startDate);
    const parsedEnd = endDate ? parseDate(endDate) : undefined;
    if (!parsedStart) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid start date");
      return;
    }
    if (parsedEnd === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid end date");
      return;
    }
    if (parsedEnd && parsedStart >= parsedEnd) {
      sendError(res, 400, "VALIDATION_ERROR", "Start date must be before end date");
      return;
    }

    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: req.params.unitId,
        propertyId: property.id,
        organizationId: req.auth?.organizationId,
        archivedAt: null
      }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found for property");
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, organizationId: req.auth?.organizationId }
    });

    if (!tenant) {
      sendError(res, 404, "TENANT_NOT_FOUND", "Tenant not found");
      return;
    }

    const activeLease = await prisma.lease.findFirst({
      where: { ...activeLeaseWhere(unit.id), organizationId: req.auth?.organizationId }
    });

    if (activeLease) {
      sendError(res, 400, "UNIT_HAS_ACTIVE_LEASE", "Unit already has an active lease");
      return;
    }

    const parsedRent = Number(rent);
    if (!Number.isFinite(parsedRent)) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid rent amount");
      return;
    }

    if (status && !["DRAFT", "ACTIVE", "ENDED"].includes(status)) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid lease status");
      return;
    }

    const created = await prisma.lease.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        propertyId: property.id,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: parsedStart,
        endDate: parsedEnd ?? undefined,
        rent: parsedRent,
        status: status ?? "ACTIVE"
      },
      include: {
        property: true,
        unit: true,
        tenant: true
      }
    });

    res.status(201).json(created);
  })
);

router.get(
  "/leases",
  asyncHandler(async (req, res) => {
    const { propertyId, status, tenantId } = req.query as {
      propertyId?: string;
      status?: "DRAFT" | "ACTIVE" | "ENDED";
      tenantId?: string;
    };

    const leases = await prisma.lease.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        propertyId: propertyId || undefined,
        status: status || undefined,
        tenantId: tenantId || undefined
      },
      orderBy: { createdAt: "desc" },
      include: {
        property: true,
        unit: true,
        tenant: true
      }
    });

    res.json(leases);
  })
);

router.get(
  "/leases/:id",
  asyncHandler(async (req, res) => {
    const lease = await prisma.lease.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId },
      include: {
        property: true,
        unit: true,
        tenant: true
      }
    });

    if (!lease) {
      sendError(res, 404, "LEASE_NOT_FOUND", "Lease not found");
      return;
    }

    res.json(lease);
  })
);

router.patch(
  "/leases/:id",
  asyncHandler(async (req, res) => {
    const lease = await prisma.lease.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!lease) {
      sendError(res, 404, "LEASE_NOT_FOUND", "Lease not found");
      return;
    }

    const body = req.body as {
      propertyId?: string;
      unitId?: string;
      tenantId?: string;
      startDate?: string;
      endDate?: string | null;
      rent?: number | string;
      status?: "DRAFT" | "ACTIVE" | "ENDED";
    };

    const parsedStart =
      "startDate" in body && body.startDate ? parseDate(body.startDate) : undefined;
    if ("startDate" in body && body.startDate && !parsedStart) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid start date");
      return;
    }
    let parsedEnd: Date | null | undefined;
    if ("endDate" in body) {
      if (body.endDate === null || body.endDate === "") {
        parsedEnd = null;
      } else if (body.endDate) {
        parsedEnd = parseDate(body.endDate);
        if (parsedEnd === null) {
          sendError(res, 400, "VALIDATION_ERROR", "Invalid end date");
          return;
        }
      }
    }

    const nextStartDate = parsedStart ?? lease.startDate;
    const nextEndDate = parsedEnd === undefined ? lease.endDate : parsedEnd;
    if (nextEndDate && nextStartDate >= nextEndDate) {
      sendError(res, 400, "VALIDATION_ERROR", "Start date must be before end date");
      return;
    }

    const nextPropertyId = body.propertyId ?? lease.propertyId;
    const nextUnitId = body.unitId ?? lease.unitId;
    const nextTenantId = body.tenantId ?? lease.tenantId;

    if (body.propertyId || body.unitId) {
      const unit = await prisma.unit.findFirst({
        where: {
          id: nextUnitId,
          propertyId: nextPropertyId,
          organizationId: req.auth?.organizationId,
          archivedAt: null
        }
      });
      if (!unit) {
        sendError(res, 400, "VALIDATION_ERROR", "Unit does not belong to property");
        return;
      }
    }

    if (body.tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: { id: nextTenantId, organizationId: req.auth?.organizationId }
      });
      if (!tenant) {
        sendError(res, 404, "TENANT_NOT_FOUND", "Tenant not found");
        return;
      }
    }

    if (body.status === "ACTIVE" || body.unitId) {
      const activeLease = await prisma.lease.findFirst({
        where: {
          ...activeLeaseWhere(nextUnitId),
          organizationId: req.auth?.organizationId,
          NOT: { id: lease.id }
        }
      });
      if (activeLease) {
        sendError(res, 400, "UNIT_HAS_ACTIVE_LEASE", "Unit already has an active lease");
        return;
      }
    }

    const nextStatus = body.status ?? lease.status;
    let endDateToSave = nextEndDate;
    if (nextStatus === "ENDED" && !endDateToSave) {
      endDateToSave = new Date();
    }

    const parsedRent =
      body.rent !== undefined ? Number(body.rent) : lease.rent;

    if (!Number.isFinite(parsedRent)) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid rent amount");
      return;
    }

    const updated = await prisma.lease.update({
      where: { id: lease.id },
      data: {
        propertyId: nextPropertyId,
        unitId: nextUnitId,
        tenantId: nextTenantId,
        startDate: nextStartDate,
        endDate: endDateToSave === null ? null : endDateToSave ?? undefined,
        rent: parsedRent,
        status: nextStatus
      },
      include: {
        property: true,
        unit: true,
        tenant: true
      }
    });

    res.json(updated);
  })
);

router.delete(
  "/leases/:id",
  asyncHandler(async (req, res) => {
    const lease = await prisma.lease.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!lease) {
      sendError(res, 404, "LEASE_NOT_FOUND", "Lease not found");
      return;
    }

    await prisma.lease.delete({ where: { id: lease.id } });
    res.status(204).send();
  })
);

export default router;
