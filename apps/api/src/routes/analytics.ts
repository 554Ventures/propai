import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { aiRateLimit } from "../middleware/ai-rate-limit.js";

const router: Router = Router();

const monthKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return next;
};

const linearRegression = (values: number[]) => {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  const xs = values.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    numerator += dx * (values[i] - meanY);
    denominator += dx * dx;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = slope * xs[i] + intercept;
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - predicted) ** 2;
  }

  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
};

router.get(
  "/forecast",
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const propertyId = req.query.property_id as string | undefined;
    const timeRange = (req.query.time_range as string | undefined) ?? "monthly";

    if (!propertyId) {
      res.status(400).json({ error: "property_id is required" });
      return;
    }

    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const [payments, expenses] = await Promise.all([
      prisma.payment.findMany({
        where: {
          userId: req.user?.id,
          propertyId,
          OR: [
            { paidDate: { gte: new Date(0) } },
            { dueDate: { gte: new Date(0) } }
          ]
        }
      }),
      prisma.expense.findMany({
        where: {
          userId: req.user?.id,
          propertyId,
          date: { gte: startMonth }
        }
      })
    ]);

    const monthlyMap = new Map<string, { income: number; expenses: number }>();
    for (let i = 0; i < 12; i += 1) {
      const key = monthKey(addMonths(startMonth, i));
      monthlyMap.set(key, { income: 0, expenses: 0 });
    }

    payments.forEach((payment: any) => {
      const date = payment.paidDate ?? payment.dueDate;
      if (!date) return;
      if (date < startMonth) return;
      const key = monthKey(date);
      const entry = monthlyMap.get(key);
      if (entry) {
        entry.income += payment.amount;
      }
    });

    expenses.forEach((expense: any) => {
      const key = monthKey(expense.date);
      const entry = monthlyMap.get(key);
      if (entry) {
        entry.expenses += expense.amount;
      }
    });

    const history = Array.from(monthlyMap.entries()).map(([period, totals]) => ({
      period,
      income: totals.income,
      expenses: totals.expenses,
      net: totals.income - totals.expenses
    }));

    const netSeries = history.map((item) => item.net);
    const { slope, intercept, r2 } = linearRegression(netSeries);

    const projection = Array.from({ length: 12 }, (_, index) => {
      const period = monthKey(addMonths(startMonth, 12 + index));
      const net = Math.round(slope * (netSeries.length + index) + intercept);
      return {
        period,
        net,
        income: Math.max(0, Math.round(net * 0.6)),
        expenses: Math.max(0, Math.round(net * 0.4))
      };
    });

    const responsePayload = {
      propertyId,
      granularity: timeRange === "annual" ? "annual" : "monthly",
      history,
      projection,
      confidence: Number.isFinite(r2) ? r2 : 0
    };

    await prisma.aIInsight.create({
      data: {
        userId: req.user?.id ?? "",
        propertyId,
        type: "CASH_FLOW_FORECAST",
        input: { timeRange },
        output: responsePayload,
        confidence: responsePayload.confidence,
        reasoning: "Linear regression on historical net cash flow."
      }
    });

    if (timeRange === "annual") {
      const aggregate = (items: typeof history | typeof projection) => {
        const yearMap = new Map<string, { income: number; expenses: number; net: number }>();
        items.forEach((item) => {
          const year = item.period.split("-")[0];
          const entry = yearMap.get(year) ?? { income: 0, expenses: 0, net: 0 };
          entry.income += item.income;
          entry.expenses += item.expenses;
          entry.net += item.net;
          yearMap.set(year, entry);
        });
        return Array.from(yearMap.entries()).map(([period, totals]) => ({
          period,
          ...totals
        }));
      };

      res.json({
        ...responsePayload,
        history: aggregate(history),
        projection: aggregate(projection)
      });
      return;
    }

    res.json(responsePayload);
  })
);

export default router;
