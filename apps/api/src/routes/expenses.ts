import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { aiRateLimit } from "../middleware/ai-rate-limit.js";
import { categorizeExpense, expenseCategories } from "../lib/ai/expense-categorizer.js";

const router: Router = Router();

router.post(
  "/categorize",
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const { description, amount, vendor, propertyId } = req.body as {
      description?: string;
      amount?: number;
      vendor?: string;
      propertyId?: string;
    };

    if (!description || typeof description !== "string") {
      res.status(400).json({ error: "Description is required" });
      return;
    }

    const result = await categorizeExpense({ description, amount, vendor });

    const insight = await prisma.aIInsight.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        propertyId,
        type: "EXPENSE_CATEGORY",
        input: { description, amount, vendor },
        output: { category: result.category },
        confidence: result.confidence,
        reasoning: result.reasoning
      }
    });

    res.json({
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      insightId: insight.id,
      allowedCategories: expenseCategories
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        ...(propertyId ? { propertyId } : {})
      },
      orderBy: { date: "desc" },
      include: { vendor: true }
    });

    res.json(expenses);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      propertyId,
      vendorId,
      vendorName,
      amount,
      category,
      date,
      notes,
      aiInsightId
    } = req.body as {
      propertyId?: string;
      vendorId?: string;
      vendorName?: string;
      amount?: number;
      category?: string;
      date?: string;
      notes?: string;
      aiInsightId?: string;
    };

    if (!propertyId || amount == null || !category || !date) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }

    let resolvedVendorId = vendorId;
    if (!resolvedVendorId && vendorName) {
      const vendor = await prisma.vendor.create({
        data: {
          userId: req.auth?.userId ?? "",
          organizationId: req.auth?.organizationId ?? "",
          name: vendorName
        }
      });
      resolvedVendorId = vendor.id;
    }

    const expense = await prisma.expense.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        propertyId,
        vendorId: resolvedVendorId,
        amount,
        category,
        date: parsedDate,
        notes
      }
    });

    if (aiInsightId) {
      const insight = await prisma.aIInsight.findFirst({
        where: { id: aiInsightId, organizationId: req.auth?.organizationId }
      });

      if (insight) {
        const suggested = (insight.output as { category?: string } | null)?.category;
        const overrideValue = suggested && suggested !== category ? category : undefined;

        await prisma.aIInsight.update({
          where: { id: insight.id },
          data: {
            expenseId: expense.id,
            overrideValue,
            overriddenAt: overrideValue ? new Date() : null
          }
        });
      }
    }

    res.status(201).json(expense);
  })
);

export default router;
