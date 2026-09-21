ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "Device" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "FaultOption" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ADD COLUMN "customerName" TEXT NOT NULL DEFAULT '';
UPDATE "WorkOrder" w SET "customerName" = c.name FROM "Device" d JOIN "Customer" c ON c.id = d."customerId" WHERE w."deviceId" = d.id;
CREATE TABLE "CustomerPhone" (
 "phone" TEXT NOT NULL PRIMARY KEY,
 "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerPhone_customerId_idx" ON "CustomerPhone"("customerId");
INSERT INTO "CustomerPhone" ("phone", "customerId") SELECT phone, id FROM "Customer";
