import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";

const router: Router = Router();

router.get(
  "/units",
  asyncHandler(async (req, res) => {
    const statusRaw = (req.query.status as string | undefined) ?? "active";
    const status = statusRaw.toLowerCase();

    if (status !== "active" && status !== "deactivated") {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid status. Use active|deactivated");
      return;
    }

    const whereArchivedAt = status === "deactivated" ? { not: null } : null;

    const units = await prisma.unit.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        archivedAt: whereArchivedAt
      },
      orderBy: status === "deactivated" ? { archivedAt: "desc" } : { createdAt: "desc" },
      include: {
        property: {
          select: { id: true, name: true }
        }
      }
    });

    res.json(units);
  })
);

router.get(
  "/properties/:propertyId/units",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const now = new Date();
    const units = await prisma.unit.findMany({
      where: { propertyId: property.id, organizationId: req.auth?.organizationId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        leases: {
          where: {
            status: "ACTIVE",
            OR: [{ endDate: null }, { endDate: { gt: now } }]
          },
          include: { tenant: true },
          orderBy: { startDate: "desc" },
          take: 1
        }
      }
    });

    res.json(
      units.map((unit: any) => ({
        ...unit,
        currentLease: unit.leases[0] ?? null,
        leases: undefined
      }))
    );
  })
);

router.post(
  "/properties/:propertyId/units",
  asyncHandler(async (req, res) => {
    const { label, bedrooms, bathrooms, squareFeet, rent } = req.body as {
      label?: string;
      bedrooms?: number;
      bathrooms?: number;
      squareFeet?: number;
      rent?: number;
    };

    if (!label) {
      sendError(res, 400, "VALIDATION_ERROR", "Unit label is required");
      return;
    }

    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const unit = await prisma.unit.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        propertyId: property.id,
        label,
        bedrooms,
        bathrooms,
        squareFeet,
        rent
      }
    });

    res.status(201).json(unit);
  })
);

router.get(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId, archivedAt: null }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    res.json(unit);
  })
);

router.patch(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId, archivedAt: null }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const { label, bedrooms, bathrooms, squareFeet, rent } = req.body as {
      label?: string;
      bedrooms?: number | null;
      bathrooms?: number | null;
      squareFeet?: number | null;
      rent?: number | null;
    };

    if (rent != null && (typeof rent !== "number" || !Number.isFinite(rent) || rent < 0)) {
      sendError(res, 400, "VALIDATION_ERROR", "Rent must be a non-negative number");
      return;
    }
    if (bedrooms != null && (typeof bedrooms !== "number" || !Number.isInteger(bedrooms) || bedrooms < 0)) {
      sendError(res, 400, "VALIDATION_ERROR", "Bedrooms must be a non-negative integer");
      return;
    }
    if (bathrooms != null && (typeof bathrooms !== "number" || !Number.isFinite(bathrooms) || bathrooms < 0)) {
      sendError(res, 400, "VALIDATION_ERROR", "Bathrooms must be a non-negative number");
      return;
    }
    if (squareFeet != null && (typeof squareFeet !== "number" || !Number.isInteger(squareFeet) || squareFeet < 0)) {
      sendError(res, 400, "VALIDATION_ERROR", "Square feet must be a non-negative integer");
      return;
    }

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: { label, bedrooms, bathrooms, squareFeet, rent }
    });

    res.json(updated);
  })
);

router.patch(
  "/units/:id/deactivate",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId, archivedAt: null }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const now = new Date();
    const activeLease = await prisma.lease.findFirst({
      where: {
        organizationId: req.auth?.organizationId,
        unitId: unit.id,
        status: "ACTIVE",
        OR: [{ endDate: null }, { endDate: { gt: now } }]
      }
    });

    if (activeLease) {
      sendError(res, 409, "UNIT_HAS_ACTIVE_LEASE", "Cannot deactivate a unit with an active lease");
      return;
    }

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: { archivedAt: now }
    });

    res.json(updated);
  })
);

router.patch(
  "/units/:id/reactivate",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId, archivedAt: { not: null } }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: { archivedAt: null }
    });

    res.json(updated);
  })
);

router.delete(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId, archivedAt: null }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    await prisma.unit.delete({ where: { id: unit.id } });
    res.status(204).send();
  })
);

export default router;
