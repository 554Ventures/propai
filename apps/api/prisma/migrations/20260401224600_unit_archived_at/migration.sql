-- Add soft-archive support for units

ALTER TABLE "Unit" ADD COLUMN "archivedAt" TIMESTAMP(3);

