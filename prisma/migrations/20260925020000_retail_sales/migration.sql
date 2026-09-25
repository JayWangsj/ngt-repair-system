-- ExtendEnum
ALTER TYPE "PaymentKind" ADD VALUE 'SALE';
CREATE TYPE "RevenueSource" AS ENUM ('REPAIR', 'RETAIL');

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailSale_amounts_valid" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "discount" < "subtotal" AND "total" = "subtotal" - "discount"),
    CONSTRAINT "RetailSale_items_positive" CHECK ("itemCount" > 0)
);

CREATE TABLE "RetailSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "RetailSaleItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailSaleItem_values_valid" CHECK ("unitPrice" >= 0 AND "quantity" > 0 AND "subtotal" = "unitPrice" * "quantity")
);

CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "source" "RevenueSource" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0)
);

-- Payment becomes a shared receipt record. Existing rows remain linked to repairs.
ALTER TABLE "Payment" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "saleId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exactly_one_source" CHECK (num_nonnulls("orderId", "saleId") = 1);

-- Preserve existing repair receipts as repair revenue allocations.
INSERT INTO "PaymentAllocation" ("id", "paymentId", "source", "amount")
SELECT "id" || '-repair', "id", 'REPAIR', "amount" FROM "Payment";

CREATE UNIQUE INDEX "RetailSale_number_key" ON "RetailSale"("number");
CREATE UNIQUE INDEX "RetailSale_requestId_key" ON "RetailSale"("requestId");
CREATE INDEX "RetailSale_createdAt_idx" ON "RetailSale"("createdAt");
CREATE INDEX "RetailSaleItem_saleId_idx" ON "RetailSaleItem"("saleId");
CREATE INDEX "RetailSaleItem_productId_idx" ON "RetailSaleItem"("productId");
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_source_key" ON "PaymentAllocation"("paymentId", "source");
CREATE INDEX "PaymentAllocation_source_idx" ON "PaymentAllocation"("source");
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
