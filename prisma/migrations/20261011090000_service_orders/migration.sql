CREATE TYPE "WorkOrderType" AS ENUM ('REPAIR', 'QUICK_SERVICE');

ALTER TYPE "RevenueSource" ADD VALUE 'QUICK_SERVICE';

ALTER TABLE "WorkOrder"
  ADD COLUMN "type" "WorkOrderType" NOT NULL DEFAULT 'REPAIR',
  ADD COLUMN "expectedAt" TEXT;

ALTER TABLE "WorkOrderItem" ADD COLUMN "quickServiceId" TEXT;

CREATE TABLE "QuickService" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultPrice" DECIMAL(12,2) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "QuickService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuickService_enabled_name_idx" ON "QuickService"("enabled", "name");

CREATE TABLE "WorkOrderDevice" (
  "orderId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  CONSTRAINT "WorkOrderDevice_pkey" PRIMARY KEY ("orderId", "deviceId")
);
CREATE INDEX "WorkOrderDevice_deviceId_idx" ON "WorkOrderDevice"("deviceId");

CREATE TABLE "ProductCompatibility" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "project" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "ProductCompatibility_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductCompatibility_productId_category_brand_model_project_key"
  ON "ProductCompatibility"("productId", "category", "brand", "model", "project");
CREATE INDEX "ProductCompatibility_category_brand_model_idx"
  ON "ProductCompatibility"("category", "brand", "model");

CREATE TABLE "RetailServiceItem" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "quickServiceId" TEXT,
  "serviceName" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "subtotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "RetailServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetailServiceItem_saleId_idx" ON "RetailServiceItem"("saleId");
CREATE INDEX "RetailServiceItem_quickServiceId_idx" ON "RetailServiceItem"("quickServiceId");

ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_quickServiceId_fkey"
  FOREIGN KEY ("quickServiceId") REFERENCES "QuickService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderDevice" ADD CONSTRAINT "WorkOrderDevice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderDevice" ADD CONSTRAINT "WorkOrderDevice_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailServiceItem" ADD CONSTRAINT "RetailServiceItem_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailServiceItem" ADD CONSTRAINT "RetailServiceItem_quickServiceId_fkey"
  FOREIGN KEY ("quickServiceId") REFERENCES "QuickService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "WorkOrderDevice" ("orderId", "deviceId")
SELECT "id", "deviceId" FROM "WorkOrder" ON CONFLICT DO NOTHING;

INSERT INTO "ProductCompatibility" ("id", "productId", "category", "brand", "model", "project")
SELECT CONCAT('legacy-', md5(CONCAT_WS('|', "requiredProductId", "category", "brand", "model", "project"))),
       "requiredProductId", "category", "brand", "model", "project"
FROM "PriceRule"
WHERE "requiredProductId" IS NOT NULL AND "brand" <> '' AND "model" <> ''
ON CONFLICT DO NOTHING;
