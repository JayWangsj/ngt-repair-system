-- CreateEnum
CREATE TYPE "ProductUsage" AS ENUM ('RETAIL', 'REPAIR', 'BOTH');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL_STOCK', 'STOCK_IN', 'RETAIL_SALE', 'REPAIR_USE', 'SALE_RETURN', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "usage" "ProductUsage" NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_prices_nonnegative" CHECK ("costPrice" >= 0 AND "salePrice" >= 0),
    CONSTRAINT "Product_stock_nonnegative" CHECK ("stockQuantity" >= 0 AND "minStock" >= 0)
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryMovement_quantity_nonzero" CHECK ("quantity" <> 0),
    CONSTRAINT "InventoryMovement_stock_valid" CHECK ("stockBefore" >= 0 AND "stockAfter" >= 0 AND "stockAfter" = "stockBefore" + "quantity")
);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_category_usage_enabled_idx" ON "Product"("category", "usage", "enabled");
CREATE INDEX "Product_enabled_favorite_idx" ON "Product"("enabled", "favorite");
CREATE UNIQUE INDEX "InventoryMovement_requestId_key" ON "InventoryMovement"("requestId");
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
