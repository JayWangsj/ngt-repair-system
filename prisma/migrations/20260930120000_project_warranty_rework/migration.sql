CREATE TYPE "ReworkTreatment" AS ENUM ('WARRANTY', 'PAID');

ALTER TABLE "WorkOrderItem"
  ADD COLUMN "warrantyStart" TIMESTAMPTZ(3),
  ADD COLUMN "warrantyDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "warrantyExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "warrantyNotes" TEXT NOT NULL DEFAULT '';

UPDATE "WorkOrderItem" item
SET
  "warrantyStart" = orders."pickedUpAt",
  "warrantyDays" = CASE
    WHEN orders."warrantyDays" > 0 THEN orders."warrantyDays"
    WHEN orders."warrantyMonths" = 1 THEN 30
    WHEN orders."warrantyMonths" = 3 THEN 90
    WHEN orders."warrantyMonths" = 6 THEN 180
    WHEN orders."warrantyMonths" = 12 THEN 365
    ELSE orders."warrantyMonths" * 30
  END,
  "warrantyExpiresAt" = CASE
    WHEN orders."pickedUpAt" IS NULL THEN NULL
    ELSE orders."pickedUpAt" + make_interval(days => CASE
      WHEN orders."warrantyDays" > 0 THEN orders."warrantyDays"
      WHEN orders."warrantyMonths" = 1 THEN 30
      WHEN orders."warrantyMonths" = 3 THEN 90
      WHEN orders."warrantyMonths" = 6 THEN 180
      WHEN orders."warrantyMonths" = 12 THEN 365
      ELSE orders."warrantyMonths" * 30
    END)
  END,
  "warrantyNotes" = orders."warrantyNotes"
FROM "WorkOrder" orders
WHERE item."orderId" = orders.id;

CREATE TABLE "ReworkSession" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "open" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ReworkSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReworkItem" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "originalItemId" TEXT NOT NULL,
  "warrantyState" TEXT NOT NULL,
  "treatment" "ReworkTreatment" NOT NULL,
  "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "requiredProductId" TEXT,
  "requiredQuantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ReworkItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "reworkSessionId" TEXT;
ALTER TABLE "WorkOrderProduct" ADD COLUMN "contextKey" TEXT NOT NULL DEFAULT 'ORIGINAL';
DROP INDEX "WorkOrderProduct_orderId_productId_kind_key";
CREATE UNIQUE INDEX "WorkOrderProduct_orderId_productId_kind_contextKey_key"
  ON "WorkOrderProduct"("orderId", "productId", "kind", "contextKey");
CREATE UNIQUE INDEX "ReworkItem_originalItemId_key" ON "ReworkItem"("originalItemId");
CREATE INDEX "ReworkSession_orderId_createdAt_idx" ON "ReworkSession"("orderId", "createdAt");
CREATE INDEX "ReworkItem_sessionId_idx" ON "ReworkItem"("sessionId");
CREATE INDEX "ReworkItem_requiredProductId_idx" ON "ReworkItem"("requiredProductId");
CREATE INDEX "Payment_reworkSessionId_idx" ON "Payment"("reworkSessionId");

ALTER TABLE "ReworkSession" ADD CONSTRAINT "ReworkSession_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkItem" ADD CONSTRAINT "ReworkItem_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ReworkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkItem" ADD CONSTRAINT "ReworkItem_originalItemId_fkey"
  FOREIGN KEY ("originalItemId") REFERENCES "WorkOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReworkItem" ADD CONSTRAINT "ReworkItem_requiredProductId_fkey"
  FOREIGN KEY ("requiredProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reworkSessionId_fkey"
  FOREIGN KEY ("reworkSessionId") REFERENCES "ReworkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeviceCatalogDeletion" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "brand" TEXT NOT NULL DEFAULT '',
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceCatalogDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceCatalogDeletion_category_kind_brand_value_key"
  ON "DeviceCatalogDeletion"("category", "kind", "brand", "value");
