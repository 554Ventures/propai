import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId ?? "";

    const [items, expenseInsights] = await Promise.all([
      prisma.aIInsight.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.aIInsight.findMany({
        where: { organizationId, type: "EXPENSE_CATEGORY" },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    ]);

    const total = expenseInsights.length;
    const accepted = expenseInsights.filter((insight: any) => !insight.overrideValue).length;
    const accuracy = total ? Number((accepted / total).toFixed(2)) : null;

    res.json({
      items,
      metrics: {
        expenseCategorizationAccuracy: accuracy,
        sampleSize: total
      }
    });
  })
);

export default router;
