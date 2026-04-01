import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";

const router: Router = Router();

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

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: req.body
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
