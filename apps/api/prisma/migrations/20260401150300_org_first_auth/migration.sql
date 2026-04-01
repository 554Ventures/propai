-- Org-first auth + authorization (one org per user for now)

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgRole') THEN
    CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
  END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- Backfill organizations for existing users (deterministic IDs)
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
SELECT
  ('org_' || u."id") AS id,
  (COALESCE(u."name", u."email") || '''s Organization') AS name,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("id") DO NOTHING;

-- Add defaultOrgId to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultOrgId" TEXT;

UPDATE "User" u
SET "defaultOrgId" = ('org_' || u."id")
WHERE u."defaultOrgId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "defaultOrgId" SET NOT NULL;

-- Create memberships for existing users (one org per user)
INSERT INTO "Membership" ("id", "userId", "organizationId", "role", "createdAt")
SELECT
  ('m_' || u."id") AS id,
  u."id",
  u."defaultOrgId",
  'OWNER'::"OrgRole",
  CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("id") DO NOTHING;

-- Add organizationId to domain tables + backfill from userId
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Property','Unit','Tenant','Lease','Payment','MaintenanceRequest','Vendor','Expense','AIInsight','Document','Notification','ChatSession',
    'AiUsage','AiSecurityEvent','AiBudget'
  ]
  LOOP
    EXECUTE format('ALTER TABLE "%s" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;', tbl);
    -- Backfill where possible from userId
    IF tbl IN ('AiSecurityEvent') THEN
      EXECUTE format('UPDATE "%s" t SET "organizationId" = (''org_'' || t."userId") WHERE t."organizationId" IS NULL AND t."userId" IS NOT NULL;', tbl);
    ELSIF tbl IN ('AiUsage','AiBudget') THEN
      EXECUTE format('UPDATE "%s" t SET "organizationId" = (''org_'' || t."userId") WHERE t."organizationId" IS NULL;', tbl);
    ELSE
      EXECUTE format('UPDATE "%s" t SET "organizationId" = (''org_'' || t."userId") WHERE t."organizationId" IS NULL;', tbl);
    END IF;
  END LOOP;
END$$;

-- Enforce NOT NULL where required
ALTER TABLE "Property" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Unit" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Lease" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MaintenanceRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AIInsight" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ChatSession" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AiUsage" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AiBudget" ALTER COLUMN "organizationId" SET NOT NULL;

-- Ensure columns exist before constraints (defensive)
ALTER TABLE "AiUsage" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "AiSecurityEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "AiBudget" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_key" ON "Membership"("userId");

-- Foreign keys
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_defaultOrgId_fkey" FOREIGN KEY ("defaultOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add org FKs (domain tables)
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIInsight" ADD CONSTRAINT "AIInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSecurityEvent" ADD CONSTRAINT "AiSecurityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiBudget" ADD CONSTRAINT "AiBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
