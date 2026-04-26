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

router.get(
  "/units/:id/cashflow",
  asyncHandler(async (req, res) => {
    const timeframe = (req.query.timeframe as string | undefined) ?? "90d";
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const now = new Date();
    let startDate: Date | null = null;
    if (timeframe === "30d") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    } else if (timeframe === "12m") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 12);
    } else if (timeframe === "all") {
      startDate = null;
    } else {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 90);
    }

    const payments = await prisma.payment.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        ...(startDate ? { dueDate: { gte: startDate } } : {}),
        lease: {
          unitId: unit.id
        }
      },
      orderBy: { dueDate: "desc" },
      take: 12,
      include: {
        lease: {
          select: { id: true, tenant: { select: { firstName: true, lastName: true } } }
        }
      }
    });

    const summary = payments.reduce(
      (acc, payment) => {
        if (payment.status === "PAID") {
          acc.collected += payment.amount;
        }
        if (payment.status === "LATE" || payment.status === "PENDING") {
          acc.outstanding += payment.amount;
        }
        return acc;
      },
      { collected: 0, outstanding: 0 }
    );

    res.json({
      unitId: unit.id,
      timeframe,
      summary,
      recentPayments: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        dueDate: payment.dueDate,
        paidDate: payment.paidDate,
        tenant: payment.lease?.tenant
          ? `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`.trim()
          : null
      }))
    });
  })
);

router.post(
  "/units/:id/cashflow/payments/:paymentId/mark-paid",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: req.params.paymentId,
        organizationId: req.auth?.organizationId,
        lease: { unitId: unit.id }
      }
    });

    if (!payment) {
      sendError(res, 404, "PAYMENT_NOT_FOUND", "Payment not found");
      return;
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidDate: new Date()
      }
    });

    res.json(updated);
  })
);

router.post(
  "/units/:id/cashflow/payments/:paymentId/remind",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id, organizationId: req.auth?.organizationId },
      include: { property: { select: { name: true } } }
    });

    if (!unit) {
      sendError(res, 404, "UNIT_NOT_FOUND", "Unit not found");
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: req.params.paymentId,
        organizationId: req.auth?.organizationId,
        lease: { unitId: unit.id }
      },
      include: {
        lease: { include: { tenant: true } }
      }
    });

    if (!payment) {
      sendError(res, 404, "PAYMENT_NOT_FOUND", "Payment not found");
      return;
    }

    const tenantName = payment.lease?.tenant
      ? `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`.trim()
      : "tenant";

    await prisma.notification.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        type: "PAYMENT_REMINDER",
        message: `Reminder logged for ${tenantName} for unit ${unit.label} (${unit.property.name}).`
      }
    });

    res.json({
      ok: true,
      message: "Payment reminder logged."
    });
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
