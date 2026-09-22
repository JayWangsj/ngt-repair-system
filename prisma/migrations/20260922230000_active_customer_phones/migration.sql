-- Preserve deleted contacts; only active primary numbers must remain unique.
DROP INDEX "Customer_phone_key";
CREATE UNIQUE INDEX "Customer_active_phone_key" ON "Customer" ("phone") WHERE "deletedAt" IS NULL;
ALTER TABLE "CustomerPhone" DROP CONSTRAINT "CustomerPhone_pkey";
ALTER TABLE "CustomerPhone" ADD CONSTRAINT "CustomerPhone_pkey" PRIMARY KEY ("phone", "customerId");
