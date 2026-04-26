import crypto from "crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  getPlaidAccounts,
  syncPlaidTransactions
} from "../lib/plaid-client.js";
import { decryptPlaidAccessToken, encryptPlaidAccessToken } from "../lib/plaid-token-crypto.js";
import { asyncHandler } from "../utils/async-handler.js";

const router: Router = Router();

type PlaidItemRow = {
  id: string;
  encryptedAccessToken: string;
  syncCursor: string | null;
};

type ReviewPayload = {
  category?: string;
  propertyId?: string | null;
  exclude?: boolean;
};

type SchemaReadinessRow = {
  plaidItemReady: string | null;
  plaidAccountReady: string | null;
  plaidImportedTransactionReady: string | null;
};

const createId = () => crypto.randomUUID();

const getOrgUser = (req: { auth?: { organizationId?: string; userId?: string } }) => {
  const organizationId = req.auth?.organizationId;
  const userId = req.auth?.userId;
  if (!organizationId || !userId) {
    return null;
  }
  return { organizationId, userId };
};

const parsePlaidDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const categoryFromPlaid = (transaction: {
  amount: number;
  name: string;
  merchant_name?: string | null;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
  category?: string[] | null;
}) => {
  const source = [
    transaction.personal_finance_category?.detailed,
    transaction.personal_finance_category?.primary,
    ...(transaction.category ?? []),
    transaction.merchant_name,
    transaction.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (transaction.amount < 0) {
    if (source.includes("rent")) return { category: "Rent", confidence: 0.86 };
    if (source.includes("deposit")) return { category: "Deposit", confidence: 0.72 };
    return { category: "Income", confidence: 0.62 };
  }

  if (source.includes("utility") || source.includes("electric") || source.includes("water")) {
    return { category: "Utilities", confidence: 0.84 };
  }
  if (source.includes("repair") || source.includes("hardware") || source.includes("maintenance")) {
    return { category: "Repairs", confidence: 0.82 };
  }
  if (source.includes("insurance")) {
    return { category: "Insurance", confidence: 0.82 };
  }
  if (source.includes("tax")) {
    return { category: "Taxes", confidence: 0.8 };
  }
  if (source.includes("mortgage") || source.includes("loan")) {
    return { category: "Mortgage", confidence: 0.78 };
  }

  return { category: "Uncategorized", confidence: 0.35 };
};

const ensurePropertyInOrg = async (propertyId: string, organizationId: string) => {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true }
  });
  return Boolean(property);
};

const isPlaidSchemaReady = async () => {
  const rows = await prisma.$queryRaw<SchemaReadinessRow[]>`
    SELECT
      to_regclass('public."PlaidItem"')::text AS "plaidItemReady",
      to_regclass('public."PlaidAccount"')::text AS "plaidAccountReady",
      to_regclass('public."PlaidImportedTransaction"')::text AS "plaidImportedTransactionReady"
  `;
  const readiness = rows[0];
  return Boolean(readiness?.plaidItemReady && readiness.plaidAccountReady && readiness.plaidImportedTransactionReady);
};

router.post(
  "/link-token",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await createPlaidLinkToken({
      userId: auth.userId,
      webhook: process.env.PLAID_WEBHOOK_URL
    });

    res.json(result);
  })
);

router.post(
  "/exchange-public-token",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { publicToken } = req.body as { publicToken?: string };
    if (!publicToken) {
      res.status(400).json({ error: "publicToken is required" });
      return;
    }

    const schemaReady = await isPlaidSchemaReady();
    if (!schemaReady) {
      res.status(503).json({
        error: "Plaid database migration has not been applied. Run the Plaid cashflow migration before connecting bank accounts.",
        code: "PLAID_SCHEMA_NOT_READY"
      });
      return;
    }

    const exchanged = await exchangePlaidPublicToken(publicToken);
    const accountsResult = await getPlaidAccounts(exchanged.accessToken);
    const encryptedAccessToken = encryptPlaidAccessToken(exchanged.accessToken);
    const itemId = createId();

    const itemRows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "PlaidItem" (
        "id", "organizationId", "userId", "plaidItemId", "institutionId", "encryptedAccessToken", "status", "createdAt", "updatedAt"
      ) VALUES (
        ${itemId}, ${auth.organizationId}, ${auth.userId}, ${exchanged.itemId}, ${accountsResult.item.institution_id ?? null}, ${encryptedAccessToken}, 'ACTIVE'::"PlaidConnectionStatus", NOW(), NOW()
      )
      ON CONFLICT ("organizationId", "plaidItemId") DO UPDATE SET
        "encryptedAccessToken" = EXCLUDED."encryptedAccessToken",
        "institutionId" = EXCLUDED."institutionId",
        "status" = 'ACTIVE'::"PlaidConnectionStatus",
        "lastSyncError" = NULL,
        "updatedAt" = NOW()
      RETURNING "id"
    `;
    const plaidItemId = itemRows[0]?.id ?? itemId;

    for (const account of accountsResult.accounts) {
      await prisma.$executeRaw`
        INSERT INTO "PlaidAccount" (
          "id", "organizationId", "userId", "plaidItemId", "plaidAccountId", "name", "mask", "type", "subtype", "status", "createdAt", "updatedAt"
        ) VALUES (
          ${createId()}, ${auth.organizationId}, ${auth.userId}, ${plaidItemId}, ${account.account_id}, ${account.name}, ${account.mask ?? null}, ${account.type ?? null}, ${account.subtype ?? null}, 'ACTIVE'::"PlaidConnectionStatus", NOW(), NOW()
        )
        ON CONFLICT ("organizationId", "plaidAccountId") DO UPDATE SET
          "name" = EXCLUDED."name",
          "mask" = EXCLUDED."mask",
          "type" = EXCLUDED."type",
          "subtype" = EXCLUDED."subtype",
          "status" = 'ACTIVE'::"PlaidConnectionStatus",
          "updatedAt" = NOW()
      `;
    }

    res.status(201).json({ itemId: plaidItemId, accountsImported: accountsResult.accounts.length });
  })
);

router.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accounts = await prisma.$queryRaw`
      SELECT
        a."id", a."plaidItemId", a."name", a."mask", a."type", a."subtype", a."status", a."updatedAt",
        i."institutionId", i."institutionName", i."lastSyncedAt", i."lastSyncError"
      FROM "PlaidAccount" a
      JOIN "PlaidItem" i ON i."id" = a."plaidItemId"
      WHERE a."organizationId" = ${auth.organizationId}
      ORDER BY a."createdAt" DESC
    `;

    res.json(accounts);
  })
);

router.post(
  "/items/:id/sync",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const itemRows = await prisma.$queryRaw<PlaidItemRow[]>`
      SELECT "id", "encryptedAccessToken", "syncCursor"
      FROM "PlaidItem"
      WHERE "id" = ${req.params.id} AND "organizationId" = ${auth.organizationId} AND "status" = 'ACTIVE'::"PlaidConnectionStatus"
      LIMIT 1
    `;
    const item = itemRows[0];
    if (!item) {
      res.status(404).json({ error: "Plaid item not found" });
      return;
    }

    const accessToken = decryptPlaidAccessToken(item.encryptedAccessToken);
    let cursor = item.syncCursor;
    let imported = 0;
    let modified = 0;
    let removed = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const page = await syncPlaidTransactions(accessToken, cursor);

        for (const plaidTransaction of [...page.added, ...page.modified]) {
          const accountRows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "PlaidAccount"
            WHERE "organizationId" = ${auth.organizationId} AND "plaidAccountId" = ${plaidTransaction.account_id}
            LIMIT 1
          `;
          const accountId = accountRows[0]?.id;
          if (!accountId) {
            continue;
          }

          const suggestion = categoryFromPlaid(plaidTransaction);
          const suggestedType = plaidTransaction.amount < 0 ? "INCOME" : "EXPENSE";
          const reviewReason = suggestion.confidence >= 0.75 ? "Needs property review" : "Needs category and property review";

          await prisma.$executeRaw`
            INSERT INTO "PlaidImportedTransaction" (
              "id", "organizationId", "userId", "plaidItemId", "accountId", "plaidTransactionId", "name", "merchantName", "amount", "date", "authorizedDate", "isoCurrencyCode", "plaidCategory", "suggestedType", "suggestedCategory", "categoryConfidence", "propertyConfidence", "reviewStatus", "reviewReason", "raw", "createdAt", "updatedAt"
            ) VALUES (
              ${createId()}, ${auth.organizationId}, ${auth.userId}, ${item.id}, ${accountId}, ${plaidTransaction.transaction_id}, ${plaidTransaction.name}, ${plaidTransaction.merchant_name ?? null}, ${new Prisma.Decimal(Math.abs(plaidTransaction.amount))}, ${parsePlaidDate(plaidTransaction.date)}, ${parsePlaidDate(plaidTransaction.authorized_date)}, ${plaidTransaction.iso_currency_code ?? null}, ${(plaidTransaction.category ?? []).join(" > ") || null}, ${suggestedType}::"TransactionType", ${suggestion.category}, ${suggestion.confidence}, ${null}, 'NEEDS_REVIEW'::"PlaidImportedTransactionStatus", ${reviewReason}, ${plaidTransaction as Prisma.InputJsonValue}, NOW(), NOW()
            )
            ON CONFLICT ("organizationId", "plaidTransactionId") DO UPDATE SET
              "name" = EXCLUDED."name",
              "merchantName" = EXCLUDED."merchantName",
              "amount" = EXCLUDED."amount",
              "date" = EXCLUDED."date",
              "authorizedDate" = EXCLUDED."authorizedDate",
              "isoCurrencyCode" = EXCLUDED."isoCurrencyCode",
              "plaidCategory" = EXCLUDED."plaidCategory",
              "suggestedType" = EXCLUDED."suggestedType",
              "suggestedCategory" = EXCLUDED."suggestedCategory",
              "categoryConfidence" = EXCLUDED."categoryConfidence",
              "reviewReason" = EXCLUDED."reviewReason",
              "raw" = EXCLUDED."raw",
              "updatedAt" = NOW()
          `;
        }

        for (const removedTransaction of page.removed) {
          await prisma.$executeRaw`
            UPDATE "PlaidImportedTransaction"
            SET "reviewStatus" = 'REMOVED'::"PlaidImportedTransactionStatus", "updatedAt" = NOW()
            WHERE "organizationId" = ${auth.organizationId} AND "plaidTransactionId" = ${removedTransaction.transaction_id}
          `;
        }

        imported += page.added.length;
        modified += page.modified.length;
        removed += page.removed.length;
        cursor = page.nextCursor;
        hasMore = page.hasMore;
      }

      await prisma.$executeRaw`
        UPDATE "PlaidItem"
        SET "syncCursor" = ${cursor}, "lastSyncedAt" = NOW(), "lastSyncError" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${item.id} AND "organizationId" = ${auth.organizationId}
      `;

      res.json({ imported, modified, removed });
    } catch (error) {
      await prisma.$executeRaw`
        UPDATE "PlaidItem"
        SET "lastSyncError" = ${error instanceof Error ? error.message : "Plaid sync failed"}, "status" = 'ERROR'::"PlaidConnectionStatus", "updatedAt" = NOW()
        WHERE "id" = ${item.id} AND "organizationId" = ${auth.organizationId}
      `;
      throw error;
    }
  })
);

router.get(
  "/transactions/review",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const transactions = await prisma.$queryRaw`
      SELECT
        pit."id", pit."name", pit."merchantName", pit."amount", pit."date", pit."suggestedType", pit."suggestedCategory",
        pit."categoryConfidence", pit."propertyConfidence", pit."reviewStatus", pit."reviewReason", pit."propertyId",
        pa."name" AS "accountName", pa."mask" AS "accountMask"
      FROM "PlaidImportedTransaction" pit
      JOIN "PlaidAccount" pa ON pa."id" = pit."accountId"
      WHERE pit."organizationId" = ${auth.organizationId} AND pit."reviewStatus" = 'NEEDS_REVIEW'::"PlaidImportedTransactionStatus"
      ORDER BY pit."date" DESC
      LIMIT 100
    `;

    res.json(transactions);
  })
);

router.patch(
  "/transactions/:id/review",
  asyncHandler(async (req, res) => {
    const auth = getOrgUser(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = req.body as ReviewPayload;
    const rows = await prisma.$queryRaw<{
      id: string;
      transactionId: string | null;
      suggestedType: "INCOME" | "EXPENSE";
      amount: Prisma.Decimal;
      date: Date;
      suggestedCategory: string | null;
      name: string;
    }[]>`
      SELECT "id", "transactionId", "suggestedType", "amount", "date", "suggestedCategory", "name"
      FROM "PlaidImportedTransaction"
      WHERE "id" = ${req.params.id} AND "organizationId" = ${auth.organizationId} AND "reviewStatus" = 'NEEDS_REVIEW'::"PlaidImportedTransactionStatus"
      LIMIT 1
    `;
    const imported = rows[0];
    if (!imported) {
      res.status(404).json({ error: "Imported transaction not found" });
      return;
    }

    if (payload.exclude) {
      await prisma.$executeRaw`
        UPDATE "PlaidImportedTransaction"
        SET "reviewStatus" = 'EXCLUDED'::"PlaidImportedTransactionStatus", "reviewedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = ${imported.id} AND "organizationId" = ${auth.organizationId}
      `;
      res.json({ status: "EXCLUDED" });
      return;
    }

    const category = payload.category?.trim() || imported.suggestedCategory;
    if (!category) {
      res.status(400).json({ error: "category is required to approve a transaction" });
      return;
    }

    const propertyId = payload.propertyId ?? null;
    if (propertyId) {
      const ok = await ensurePropertyInOrg(propertyId, auth.organizationId);
      if (!ok) {
        res.status(400).json({ error: "Invalid propertyId" });
        return;
      }
    }

    const transactionId = imported.transactionId ?? createId();
    if (!imported.transactionId) {
      await prisma.$executeRaw`
        INSERT INTO "Transaction" (
          "id", "organizationId", "userId", "type", "amount", "date", "category", "propertyId", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${transactionId}, ${auth.organizationId}, ${auth.userId}, ${imported.suggestedType}::"TransactionType", ${imported.amount}, ${imported.date}, ${category}, ${propertyId}, ${`Imported from Plaid: ${imported.name}`}, NOW(), NOW()
        )
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "Transaction"
        SET "category" = ${category}, "propertyId" = ${propertyId}, "updatedAt" = NOW()
        WHERE "id" = ${transactionId} AND "organizationId" = ${auth.organizationId}
      `;
    }

    await prisma.$executeRaw`
      UPDATE "PlaidImportedTransaction"
      SET "transactionId" = ${transactionId}, "propertyId" = ${propertyId}, "suggestedCategory" = ${category}, "reviewStatus" = 'REVIEWED'::"PlaidImportedTransactionStatus", "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${imported.id} AND "organizationId" = ${auth.organizationId}
    `;

    res.json({ status: "REVIEWED", transactionId });
  })
);

export default router;
