import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";
import { Prisma } from "@prisma/client";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === "true";
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const rows = await prisma.property.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        ...(includeArchived ? {} : { archivedAt: null })
      },
      orderBy: { createdAt: "desc" },
      include: {
        units: {
          where: { archivedAt: null },
          include: {
            leases: {
              where: { status: "ACTIVE" },
              select: { id: true }
            }
          }
        }
      }
    });

    const propertyIds = rows.map((property) => property.id);
    const [openMaintenance, overduePayments, expiringLeases] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where: {
          organizationId: req.auth?.organizationId,
          propertyId: { in: propertyIds },
          status: { in: ["PENDING", "IN_PROGRESS"] }
        },
        select: { propertyId: true }
      }),
      prisma.payment.findMany({
        where: {
          organizationId: req.auth?.organizationId,
          propertyId: { in: propertyIds },
          OR: [{ status: "LATE" }, { status: "PENDING", dueDate: { lt: now } }]
        },
        select: { propertyId: true }
      }),
      prisma.lease.findMany({
        where: {
          organizationId: req.auth?.organizationId,
          propertyId: { in: propertyIds },
          status: "ACTIVE",
          endDate: { gte: now, lte: in30Days }
        },
        select: { propertyId: true, endDate: true }
      })
    ]);

    const maintenanceByProperty = openMaintenance.reduce<Record<string, number>>((acc, row) => {
      acc[row.propertyId] = (acc[row.propertyId] ?? 0) + 1;
      return acc;
    }, {});

    const overdueByProperty = overduePayments.reduce<Record<string, number>>((acc, row) => {
      acc[row.propertyId] = (acc[row.propertyId] ?? 0) + 1;
      return acc;
    }, {});

    const expiringByProperty = expiringLeases.reduce<Record<string, number>>((acc, row) => {
      acc[row.propertyId] = (acc[row.propertyId] ?? 0) + 1;
      return acc;
    }, {});

    const properties = rows.map(({ units, ...property }) => {
      const unitCount = units.length;
      const occupiedCount = units.filter((unit) => unit.leases.length > 0).length;
      const vacancyCount = Math.max(0, unitCount - occupiedCount);
      const activeLeaseCount = occupiedCount;
      const overduePaymentCount = overdueByProperty[property.id] ?? 0;
      const openMaintenanceCount = maintenanceByProperty[property.id] ?? 0;
      const expiringLeaseCount30 = expiringByProperty[property.id] ?? 0;

      let aiPrediction: {
        label: string;
        reason: string;
        confidence: number;
        priority: "HIGH" | "MEDIUM" | "LOW";
      } = {
        label: "Stable this week",
        reason: "No urgent rent, lease, or maintenance issues detected.",
        confidence: 0.72,
        priority: "LOW"
      };

      if (overduePaymentCount > 0) {
        aiPrediction = {
          label: `${overduePaymentCount} overdue rent item${overduePaymentCount > 1 ? "s" : ""}`,
          reason: "Prioritize rent follow-up to protect monthly cash flow.",
          confidence: 0.86,
          priority: "HIGH"
        };
      } else if (expiringLeaseCount30 > 0) {
        aiPrediction = {
          label: `${expiringLeaseCount30} lease${expiringLeaseCount30 > 1 ? "s" : ""} expiring in 30 days`,
          reason: "Start renewal outreach early to reduce vacancy risk.",
          confidence: 0.81,
          priority: "HIGH"
        };
      } else if (vacancyCount > 0) {
        aiPrediction = {
          label: `${vacancyCount} vacant unit${vacancyCount > 1 ? "s" : ""}`,
          reason: "Listing and showing these units can recover income quickly.",
          confidence: 0.79,
          priority: "MEDIUM"
        };
      } else if (openMaintenanceCount > 0) {
        aiPrediction = {
          label: `${openMaintenanceCount} open maintenance request${openMaintenanceCount > 1 ? "s" : ""}`,
          reason: "Clearing maintenance backlog helps tenant retention.",
          confidence: 0.75,
          priority: "MEDIUM"
        };
      }

      return {
        ...property,
        unitCount,
        occupiedCount,
        vacancyCount,
        activeLeaseCount,
        overduePaymentCount,
        openMaintenanceCount,
        expiringLeaseCount30,
        aiPrediction
      };
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

    const { name, addressLine1, addressLine2, city, state, postalCode, country, notes } =
      req.body as {
        name?: string;
        addressLine1?: string;
        addressLine2?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
        notes?: string;
      };

    const updated = await prisma.property.update({
      where: { id: property.id },
      data: { name, addressLine1, addressLine2, city, state, postalCode, country, notes }
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
