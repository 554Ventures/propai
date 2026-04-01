import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

type TxType = "income" | "expense";

const parseType = (value: unknown) => {
  if (value == null) {
    return undefined;
  }
  const s = String(value).toLowerCase();
  if (s === "income") {
    return "INCOME" as const;
  }
  if (s === "expense") {
    return "EXPENSE" as const;
  }
  return null;
};

const parseDate = (value: unknown) => {
  if (value == null) {
    return undefined;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
};

const parseAmount = (value: unknown) => {
  if (value == null) {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  if (n <= 0) {
    return null;
  }
  return n;
};

const ensurePropertyInOrg = async (propertyId: string, organizationId: string) => {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true }
  });
  return Boolean(property);
};

// GET /cashflow/transactions?type=&propertyId=&from=&to=
router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const type = parseType(req.query.type);
    if (type === null) {
      res.status(400).json({ error: "Invalid type (expected income|expense)" });
      return;
    }

    const propertyId = (req.query.propertyId as string | undefined) ?? undefined;

    const from = parseDate(req.query.from);
    if (from === null) {
      res.status(400).json({ error: "Invalid from date" });
      return;
    }

    const to = parseDate(req.query.to);
    if (to === null) {
      res.status(400).json({ error: "Invalid to date" });
      return;
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        organizationId,
        ...(type ? { type } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {})
              }
            }
          : {})
      },
      orderBy: { date: "desc" }
    });

    res.json(transactions);
  })
);

// POST /cashflow/transactions
router.post(
  "/transactions",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { type, amount, date, category, propertyId, notes } = req.body as {
      type?: TxType;
      amount?: number | string;
      date?: string;
      category?: string;
      propertyId?: string | null;
      notes?: string | null;
    };

    const parsedType = parseType(type);
    if (!parsedType) {
      res.status(400).json({ error: "type is required (income|expense)" });
      return;
    }

    const parsedAmount = parseAmount(amount);
    if (parsedAmount == null) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const parsedDate = parseDate(date);
    if (!parsedDate) {
      res.status(400).json({ error: "date is required and must be a valid ISO date" });
      return;
    }

    if (!category || typeof category !== "string") {
      res.status(400).json({ error: "category is required" });
      return;
    }

    const normalizedPropertyId = propertyId ?? undefined;
    if (normalizedPropertyId) {
      const ok = await ensurePropertyInOrg(normalizedPropertyId, organizationId);
      if (!ok) {
        res.status(400).json({ error: "Invalid propertyId" });
        return;
      }
    }

    const tx = await prisma.transaction.create({
      data: {
        organizationId,
        userId,
        type: parsedType,
        amount: parsedAmount,
        date: parsedDate,
        category,
        propertyId: normalizedPropertyId,
        notes: notes ?? undefined
      }
    });

    res.status(201).json(tx);
  })
);

// PATCH /cashflow/transactions/:id
router.patch(
  "/transactions/:id",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = req.params.id;

    const existing = await prisma.transaction.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { type, amount, date, category, propertyId, notes } = req.body as {
      type?: TxType;
      amount?: number | string;
      date?: string;
      category?: string;
      propertyId?: string | null;
      notes?: string | null;
    };

    const updateData: Record<string, unknown> = {};

    if (type != null) {
      const parsedType = parseType(type);
      if (!parsedType) {
        res.status(400).json({ error: "Invalid type (expected income|expense)" });
        return;
      }
      updateData.type = parsedType;
    }

    if (amount != null) {
      const parsedAmount = parseAmount(amount);
      if (parsedAmount == null) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }
      updateData.amount = parsedAmount;
    }

    if (date != null) {
      const parsedDate = parseDate(date);
      if (!parsedDate) {
        res.status(400).json({ error: "Invalid date" });
        return;
      }
      updateData.date = parsedDate;
    }

    if (category != null) {
      if (!category || typeof category !== "string") {
        res.status(400).json({ error: "Invalid category" });
        return;
      }
      updateData.category = category;
    }

    if (propertyId !== undefined) {
      const normalizedPropertyId = propertyId ?? null;
      if (normalizedPropertyId) {
        const ok = await ensurePropertyInOrg(normalizedPropertyId, organizationId);
        if (!ok) {
          res.status(400).json({ error: "Invalid propertyId" });
          return;
        }
      }
      updateData.propertyId = normalizedPropertyId;
    }

    if (notes !== undefined) {
      updateData.notes = notes ?? null;
    }

    const updated = await prisma.transaction.update({
      where: { id: existing.id },
      data: updateData
    });

    res.json(updated);
  })
);

// DELETE /cashflow/transactions/:id
router.delete(
  "/transactions/:id",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = req.params.id;

    const existing = await prisma.transaction.findFirst({
      where: { id, organizationId },
      select: { id: true }
    });

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.transaction.delete({ where: { id: existing.id } });

    res.status(204).send();
  })
);

export default router;
