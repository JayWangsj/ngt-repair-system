ALTER TABLE "WorkOrder" ADD COLUMN "code" TEXT;
ALTER TABLE "RetailSale" ADD COLUMN "code" TEXT;
ALTER TABLE "PriceRule"
  ADD COLUMN "requiredProductId" TEXT,
  ADD COLUMN "requiredQuantity" INTEGER NOT NULL DEFAULT 1;

WITH numbered AS (
  SELECT
    id,
    'R-' || to_char("createdAt" AT TIME ZONE 'Europe/Rome', 'YYYYMMDD') ||
      lpad(row_number() OVER (
        PARTITION BY ("createdAt" AT TIME ZONE 'Europe/Rome')::date
        ORDER BY "createdAt", number
      )::text, 3, '0') AS code
  FROM "WorkOrder"
)
UPDATE "WorkOrder" SET code = numbered.code
FROM numbered WHERE "WorkOrder".id = numbered.id;

WITH numbered AS (
  SELECT
    id,
    'V-' || to_char("createdAt" AT TIME ZONE 'Europe/Rome', 'YYYYMMDD') ||
      lpad(row_number() OVER (
        PARTITION BY ("createdAt" AT TIME ZONE 'Europe/Rome')::date
        ORDER BY "createdAt", number
      )::text, 3, '0') AS code
  FROM "RetailSale"
)
UPDATE "RetailSale" SET code = numbered.code
FROM numbered WHERE "RetailSale".id = numbered.id;

ALTER TABLE "WorkOrder" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "RetailSale" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "WorkOrder_code_key" ON "WorkOrder"("code");
CREATE UNIQUE INDEX "RetailSale_code_key" ON "RetailSale"("code");
CREATE INDEX "PriceRule_requiredProductId_idx" ON "PriceRule"("requiredProductId");
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_requiredProductId_fkey"
  FOREIGN KEY ("requiredProductId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InventoryCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "repairOnly" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCategory_name_key" ON "InventoryCategory"("name");
INSERT INTO "InventoryCategory" ("id", "name", "repairOnly")
SELECT md5('inventory-category:' || category), category,
  lower(category) = lower('Ricambi')
FROM (SELECT DISTINCT category FROM "Product") categories;
