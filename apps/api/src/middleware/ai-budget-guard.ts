import type { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { logAiSecurityEvent } from "../security/security-logger.js";

const parseLimit = (value: string | undefined) => {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const defaultMonthlyLimitUsd = parseLimit(process.env.AI_BUDGET_MONTHLY_USD);
const warnThreshold = parseLimit(process.env.AI_BUDGET_WARN_THRESHOLD ?? "0.8");

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const aiBudgetGuard = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  const organizationId = req.auth?.organizationId;
  if (!userId) {
    next();
    return;
  }
  if (!organizationId) {
    next();
    return;
  }

  const now = new Date();
  const monthStart = startOfMonth(now);

  const budget = await prisma.aiBudget.findFirst({ where: { userId, organizationId } });
  const limit = budget?.monthlyLimitUsd ?? defaultMonthlyLimitUsd;

  if (!limit || limit <= 0) {
    next();
    return;
  }

  const usage = await prisma.aiUsage.aggregate({
    where: {
      organizationId,
      createdAt: { gte: monthStart, lte: now }
    },
    _sum: { costUsd: true }
  });

  const spent = usage._sum.costUsd ?? 0;

  if (spent >= limit) {
    await logAiSecurityEvent({
      userId,
      organizationId,
      type: "budget_exceeded",
      severity: "high",
      message: "AI budget exceeded",
      metadata: { spent, limit }
    });
    res.status(429).json({ error: "AI budget exceeded" });
    return;
  }

  if (warnThreshold > 0 && spent >= limit * warnThreshold) {
    await logAiSecurityEvent({
      userId,
      organizationId,
      type: "budget_near_limit",
      severity: "medium",
      message: "AI budget nearing limit",
      metadata: { spent, limit, threshold: warnThreshold }
    });
  }

  next();
};
