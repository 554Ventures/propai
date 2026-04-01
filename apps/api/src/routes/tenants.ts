import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenants = await prisma.tenant.findMany({
      where: { organizationId: req.auth?.organizationId },
      orderBy: { createdAt: "desc" }
    });

    res.json(tenants);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };

    if (!firstName || !lastName) {
      res.status(400).json({ error: "First and last name are required" });
      return;
    }

    const tenant = await prisma.tenant.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        firstName,
        lastName,
        email,
        phone
      }
    });

    res.status(201).json(tenant);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(tenant);
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: req.body
    });

    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    await prisma.tenant.delete({ where: { id: tenant.id } });
    res.status(204).send();
  })
);

export default router;
