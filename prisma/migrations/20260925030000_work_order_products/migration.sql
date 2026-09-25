CREATE TYPE "WorkOrderProductKind" AS ENUM ('REPAIR_PART', 'RETAIL_ADDON');

CREATE TABLE "WorkOrderProduct" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" "WorkOrderProductKind" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkOrderProduct_values_valid" CHECK ("unitPrice" >= 0 AND "discount" >= 0 AND "discount" <= "unitPrice" * "quantity" AND "quantity" > 0)
);

CREATE UNIQUE INDEX "WorkOrderProduct_orderId_productId_kind_key" ON "WorkOrderProduct"("orderId", "productId", "kind");
CREATE INDEX "WorkOrderProduct_orderId_idx" ON "WorkOrderProduct"("orderId");
CREATE INDEX "WorkOrderProduct_productId_idx" ON "WorkOrderProduct"("productId");

ALTER TABLE "WorkOrderProduct" ADD CONSTRAINT "WorkOrderProduct_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderProduct" ADD CONSTRAINT "WorkOrderProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
