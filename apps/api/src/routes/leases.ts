import { Router } from "express";
import prisma from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

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
      res.status(400).json({ error: "Missing required lease fields" });
      return;
    }

    const parsedStart = parseDate(startDate);
    const parsedEnd = endDate ? parseDate(endDate) : undefined;
    if (!parsedStart) {
      res.status(400).json({ error: "Invalid start date" });
      return;
    }
    if (parsedEnd === null) {
      res.status(400).json({ error: "Invalid end date" });
      return;
    }
    if (parsedEnd && parsedStart >= parsedEnd) {
      res.status(400).json({ error: "Start date must be before end date" });
      return;
    }

    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const unit = await prisma.unit.findFirst({
      where: { id: req.params.unitId, propertyId: property.id, userId: req.user?.id }
    });

    if (!unit) {
      res.status(404).json({ error: "Unit not found for property" });
      return;
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, userId: req.user?.id }
    });

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const activeLease = await prisma.lease.findFirst({
      where: activeLeaseWhere(unit.id)
    });

    if (activeLease) {
      res.status(400).json({ error: "Unit already has an active lease" });
      return;
    }

    const parsedRent = Number(rent);
    if (!Number.isFinite(parsedRent)) {
      res.status(400).json({ error: "Invalid rent amount" });
      return;
    }

    if (status && !["DRAFT", "ACTIVE", "ENDED"].includes(status)) {
      res.status(400).json({ error: "Invalid lease status" });
      return;
    }

    const created = await prisma.lease.create({
      data: {
        userId: req.user?.id ?? "",
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
        userId: req.user?.id,
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
      where: { id: req.params.id, userId: req.user?.id },
      include: {
        property: true,
        unit: true,
        tenant: true
      }
    });

    if (!lease) {
      res.status(404).json({ error: "Lease not found" });
      return;
    }

    res.json(lease);
  })
);

router.patch(
  "/leases/:id",
  asyncHandler(async (req, res) => {
    const lease = await prisma.lease.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!lease) {
      res.status(404).json({ error: "Lease not found" });
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
      res.status(400).json({ error: "Invalid start date" });
      return;
    }
    let parsedEnd: Date | null | undefined;
    if ("endDate" in body) {
      if (body.endDate === null || body.endDate === "") {
        parsedEnd = null;
      } else if (body.endDate) {
        parsedEnd = parseDate(body.endDate);
        if (parsedEnd === null) {
          res.status(400).json({ error: "Invalid end date" });
          return;
        }
      }
    }

    const nextStartDate = parsedStart ?? lease.startDate;
    const nextEndDate = parsedEnd === undefined ? lease.endDate : parsedEnd;
    if (nextEndDate && nextStartDate >= nextEndDate) {
      res.status(400).json({ error: "Start date must be before end date" });
      return;
    }

    const nextPropertyId = body.propertyId ?? lease.propertyId;
    const nextUnitId = body.unitId ?? lease.unitId;
    const nextTenantId = body.tenantId ?? lease.tenantId;

    if (body.propertyId || body.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: nextUnitId, propertyId: nextPropertyId, userId: req.user?.id }
      });
      if (!unit) {
        res.status(400).json({ error: "Unit does not belong to property" });
        return;
      }
    }

    if (body.tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: { id: nextTenantId, userId: req.user?.id }
      });
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
    }

    if (body.status === "ACTIVE" || body.unitId) {
      const activeLease = await prisma.lease.findFirst({
        where: {
          ...activeLeaseWhere(nextUnitId),
          NOT: { id: lease.id }
        }
      });
      if (activeLease) {
        res.status(400).json({ error: "Unit already has an active lease" });
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
      res.status(400).json({ error: "Invalid rent amount" });
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
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!lease) {
      res.status(404).json({ error: "Lease not found" });
      return;
    }

    await prisma.lease.delete({ where: { id: lease.id } });
    res.status(204).send();
  })
);

export default router;
