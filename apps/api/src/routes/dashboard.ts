import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

router.get(
  "/metrics",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId ?? "";
    const now = new Date();

    // Get unique occupied units (can't use distinct with count, so find all and get unique unitIds)
    const activeLeases = await prisma.lease.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }]
      },
      select: { unitId: true }
    });
    const occupiedUnitsCount = new Set(activeLeases.map((l: any) => l.unitId)).size;

    const [propertiesCount, unitsCount, tenantsCount, totalIncome, outstandingRent, maintenanceCosts] =
      await Promise.all([
        prisma.property.count({ where: { organizationId } }),
        prisma.unit.count({ where: { organizationId, archivedAt: null } }),
        prisma.tenant.count({ where: { organizationId } }),
        prisma.payment.aggregate({
          where: { organizationId, status: "PAID" },
          _sum: { amount: true }
        }),
        prisma.payment.aggregate({
          where: {
            organizationId,
            OR: [
              { status: "LATE" },
              { status: "PENDING", dueDate: { lt: now } }
            ]
          },
          _sum: { amount: true }
        }),
        prisma.maintenanceRequest.aggregate({
          where: { organizationId },
          _sum: { cost: true }
        })
      ]);

    const occupancyRate = unitsCount === 0 ? 0 : occupiedUnitsCount / unitsCount;

    res.json({
      occupancyRate,
      totalIncome: totalIncome._sum.amount ?? 0,
      outstandingRent: outstandingRent._sum.amount ?? 0,
      maintenanceCosts: maintenanceCosts._sum.cost ?? 0,
      totals: {
        properties: propertiesCount,
        units: unitsCount,
        tenants: tenantsCount,
        occupiedUnits: occupiedUnitsCount
      }
    });
  })
);

router.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId ?? "";
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [latePayments, expiringLeases, pendingMaintenance] = await Promise.all([
      prisma.payment.findMany({
        where: {
          organizationId,
          OR: [
            { status: "LATE" },
            { status: "PENDING", dueDate: { lt: now } }
          ]
        },
        include: {
          lease: {
            include: {
              tenant: true,
              property: true,
              unit: true
            }
          }
        },
        orderBy: { dueDate: "asc" },
        take: 10
      }),
      prisma.lease.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          endDate: { gte: now, lte: in30Days }
        },
        include: {
          tenant: true,
          property: true,
          unit: true
        },
        orderBy: { endDate: "asc" },
        take: 10
      }),
      prisma.maintenanceRequest.findMany({
        where: {
          organizationId,
          status: { in: ["PENDING", "IN_PROGRESS"] }
        },
        include: {
          property: true,
          unit: true,
          tenant: true
        },
        orderBy: { createdAt: "asc" },
        take: 10
      })
    ]);

    res.json({
      latePayments: {
        count: latePayments.length,
        items: latePayments.map((payment: any) => ({
          id: payment.id,
          amount: payment.amount,
          dueDate: payment.dueDate,
          status: payment.status,
          property: payment.lease?.property?.name ?? null,
          tenant: payment.lease?.tenant
            ? `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`
            : null,
          unit: payment.lease?.unit?.label ?? null
        }))
      },
      expiringLeases: {
        count: expiringLeases.length,
        items: expiringLeases.map((lease: any) => ({
          id: lease.id,
          endDate: lease.endDate,
          rent: lease.rent,
          property: lease.property?.name ?? null,
          tenant: lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : null,
          unit: lease.unit?.label ?? null
        }))
      },
      pendingMaintenance: {
        count: pendingMaintenance.length,
        items: pendingMaintenance.map((request: any) => ({
          id: request.id,
          title: request.title,
          status: request.status,
          createdAt: request.createdAt,
          property: request.property?.name ?? null,
          unit: request.unit?.label ?? null,
          tenant: request.tenant
            ? `${request.tenant.firstName} ${request.tenant.lastName}`
            : null
        }))
      }
    });
  })
);

export default router;
