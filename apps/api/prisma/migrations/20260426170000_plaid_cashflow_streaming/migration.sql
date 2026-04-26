-- CreateEnum
CREATE TYPE "PlaidConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR', 'REAUTH_REQUIRED');

-- CreateEnum
CREATE TYPE "PlaidImportedTransactionStatus" AS ENUM ('AUTO_APPROVED', 'NEEDS_REVIEW', 'REVIEWED', 'EXCLUDED', 'REMOVED', 'SYNC_ERROR');

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "syncCursor" TEXT,
    "status" "PlaidConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mask" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "status" "PlaidConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidImportedTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "transactionId" TEXT,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedDate" TIMESTAMP(3),
    "isoCurrencyCode" TEXT,
    "plaidCategory" TEXT,
    "suggestedType" "TransactionType" NOT NULL,
    "suggestedCategory" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "propertyConfidence" DOUBLE PRECISION,
    "reviewStatus" "PlaidImportedTransactionStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_organizationId_plaidItemId_key" ON "PlaidItem"("organizationId", "plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidItem_organizationId_idx" ON "PlaidItem"("organizationId");

-- CreateIndex
CREATE INDEX "PlaidItem_organizationId_status_idx" ON "PlaidItem"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidAccount_organizationId_plaidAccountId_key" ON "PlaidAccount"("organizationId", "plaidAccountId");

-- CreateIndex
CREATE INDEX "PlaidAccount_organizationId_idx" ON "PlaidAccount"("organizationId");

-- CreateIndex
CREATE INDEX "PlaidAccount_plaidItemId_idx" ON "PlaidAccount"("plaidItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidImportedTransaction_transactionId_key" ON "PlaidImportedTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidImportedTransaction_organizationId_plaidTransactionId_key" ON "PlaidImportedTransaction"("organizationId", "plaidTransactionId");

-- CreateIndex
CREATE INDEX "PlaidImportedTransaction_organizationId_idx" ON "PlaidImportedTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "PlaidImportedTransaction_organizationId_reviewStatus_idx" ON "PlaidImportedTransaction"("organizationId", "reviewStatus");

-- CreateIndex
CREATE INDEX "PlaidImportedTransaction_organizationId_date_idx" ON "PlaidImportedTransaction"("organizationId", "date");

-- CreateIndex
CREATE INDEX "PlaidImportedTransaction_organizationId_propertyId_idx" ON "PlaidImportedTransaction"("organizationId", "propertyId");

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidAccount" ADD CONSTRAINT "PlaidAccount_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidImportedTransaction" ADD CONSTRAINT "PlaidImportedTransaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
