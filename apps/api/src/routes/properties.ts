import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";
import { Prisma } from "@prisma/client";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const properties = await prisma.property.findMany({
      where: { organizationId: req.auth?.organizationId },
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
      sendError(res, 400, "VALIDATION_ERROR", "Missing required fields");
      return;
    }

    const property = await prisma.property.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
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
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    res.json(property);
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
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
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    try {
      await prisma.property.delete({ where: { id: property.id } });
      res.status(204).send();
    } catch (err: unknown) {
      // FK constraint (e.g. existing units/leases/payments/etc)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        sendError(
          res,
          409,
          "PROPERTY_DELETE_CONFLICT",
          "Cannot delete property while it has related records (e.g., units or leases)"
        );
        return;
      }
      throw err;
    }
  })
);

export default router;
