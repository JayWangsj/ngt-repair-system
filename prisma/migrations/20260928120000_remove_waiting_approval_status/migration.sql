UPDATE "WorkOrder"
SET "status" = 'REPAIRING'
WHERE "status" = 'WAITING_APPROVAL';

UPDATE "StatusHistory"
SET "from" = 'REPAIRING'
WHERE "from" = 'WAITING_APPROVAL';

UPDATE "StatusHistory"
SET "to" = 'REPAIRING'
WHERE "to" = 'WAITING_APPROVAL';

ALTER TYPE "Status" RENAME TO "Status_old";
CREATE TYPE "Status" AS ENUM (
  'RECEIVED',
  'DIAGNOSING',
  'REPAIRING',
  'PARTS_MISSING',
  'READY',
  'COMPLETED',
  'REWORKING',
  'REFUNDED',
  'CANCELLED'
);
ALTER TABLE "WorkOrder"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "Status" USING ("status"::text::"Status"),
  ALTER COLUMN "status" SET DEFAULT 'RECEIVED';
ALTER TABLE "StatusHistory"
  ALTER COLUMN "from" TYPE "Status" USING ("from"::text::"Status"),
  ALTER COLUMN "to" TYPE "Status" USING ("to"::text::"Status");
DROP TYPE "Status_old";
