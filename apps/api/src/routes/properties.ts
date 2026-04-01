import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const properties = await prisma.property.findMany({
      where: { userId: req.user?.id },
      orderBy: { createdAt: "desc" }
    });

    res.json(properties);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, addressLine1, addressLine2, city, state, postalCode, country, notes } = req.body as {
      name?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      notes?: string;
    };

    if (!name || !addressLine1 || !city || !state || !postalCode) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const property = await prisma.property.create({
      data: {
        userId: req.user?.id ?? "",
        name,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country: country ?? "US",
        notes
      }
    });

    res.status(201).json(property);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    res.json(property);
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const updated = await prisma.property.update({
      where: { id: property.id },
      data: req.body
    });

    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, userId: req.user?.id }
    });

    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    await prisma.property.delete({ where: { id: property.id } });
    res.status(204).send();
  })
);

export default router;
