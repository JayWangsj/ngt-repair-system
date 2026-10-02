UPDATE "Product"
SET "usage" = 'RETAIL'
WHERE "usage" = 'BOTH';

ALTER TYPE "ProductUsage" RENAME TO "ProductUsage_old";
CREATE TYPE "ProductUsage" AS ENUM ('RETAIL', 'REPAIR');

ALTER TABLE "Product"
ALTER COLUMN "usage" TYPE "ProductUsage"
USING ("usage"::text::"ProductUsage");

DROP TYPE "ProductUsage_old";
