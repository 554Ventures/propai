-- Add optional title + rolling summary to chat sessions

ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- Helpful index for listing/search (optional)
CREATE INDEX IF NOT EXISTS "ChatSession_organizationId_updatedAt_idx" ON "ChatSession"("organizationId", "updatedAt");
