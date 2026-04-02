-- AI action log for two-step confirm (plan/confirm/cancel)

-- CreateTable
CREATE TABLE "AiActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiActionLog" ADD CONSTRAINT "AiActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActionLog" ADD CONSTRAINT "AiActionLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AiActionLog_organizationId_idx" ON "AiActionLog"("organizationId");
CREATE INDEX "AiActionLog_organizationId_userId_idx" ON "AiActionLog"("organizationId", "userId");
CREATE INDEX "AiActionLog_organizationId_status_idx" ON "AiActionLog"("organizationId", "status");
CREATE INDEX "AiActionLog_organizationId_actionType_idx" ON "AiActionLog"("organizationId", "actionType");
