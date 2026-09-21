ALTER TABLE "Device" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'PHONE';
ALTER TABLE "WorkOrder" ADD COLUMN "orderDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0, ADD COLUMN "includeVat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrderItem" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE TABLE "FaultOption" ("id" TEXT NOT NULL, "category" TEXT NOT NULL, "name" TEXT NOT NULL, "key" TEXT NOT NULL, CONSTRAINT "FaultOption_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "FaultOption_category_key_key" ON "FaultOption"("category", "key");
ALTER TABLE "WorkOrder" ADD CONSTRAINT "order_discount_nonnegative" CHECK ("orderDiscount" >= 0);
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "item_discount_valid" CHECK ("discount" >= 0 AND "discount" <= "final");
