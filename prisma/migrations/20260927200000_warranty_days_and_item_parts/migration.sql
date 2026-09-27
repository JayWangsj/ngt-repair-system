ALTER TABLE "WorkOrder"
  ADD COLUMN "warrantyDays" INTEGER NOT NULL DEFAULT 0;

UPDATE "WorkOrder"
SET "warrantyDays" = CASE "warrantyMonths"
  WHEN 1 THEN 30
  WHEN 3 THEN 90
  WHEN 6 THEN 180
  WHEN 12 THEN 365
  ELSE "warrantyMonths" * 30
END
WHERE "warrantyMonths" > 0;

ALTER TABLE "WorkOrderItem"
  ADD COLUMN "requiredProductId" TEXT,
  ADD COLUMN "requiredQuantity" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WorkOrderItem"
  ADD CONSTRAINT "WorkOrderItem_requiredProductId_fkey"
  FOREIGN KEY ("requiredProductId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkOrderItem_requiredProductId_idx"
  ON "WorkOrderItem"("requiredProductId");
