import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

router.get(
  "/properties/:propertyId/units",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const now = new Date();
    const units = await prisma.unit.findMany({
      where: { propertyId: property.id },
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
      res.status(400).json({ error: "Unit label is required" });
      return;
    }

    const property = await prisma.property.findFirst({
      where: { id: req.params.propertyId, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const unit = await prisma.unit.create({
      data: {
        userId: req.user?.id ?? "",
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
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!unit) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }

    res.json(unit);
  })
);

router.patch(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!unit) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }

    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: req.body
    });

    res.json(updated);
  })
);

router.delete(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!unit) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }

    await prisma.unit.delete({ where: { id: unit.id } });
    res.status(204).send();
  })
);

export default router;
