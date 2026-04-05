-- DropIndex
DROP INDEX "ChatSession_organizationId_updatedAt_idx";

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "archivedAt" TIMESTAMP(3);
