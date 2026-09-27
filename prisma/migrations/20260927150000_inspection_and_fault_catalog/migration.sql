ALTER TABLE "WorkOrder"
ADD COLUMN "inspectionMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "inspectionFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "inspectionResult" TEXT NOT NULL DEFAULT '',
ADD COLUMN "faultNote" TEXT NOT NULL DEFAULT '';

ALTER TABLE "FaultOption"
ADD COLUMN "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "FaultOption_category_hidden_sortOrder_idx"
ON "FaultOption"("category", "hidden", "sortOrder");

CREATE TABLE "WorkOrderFault" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "catalogId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "custom" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "WorkOrderFault_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkOrderFault_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkOrderFault_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "FaultOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkOrderFault_orderId_idx" ON "WorkOrderFault"("orderId");
CREATE INDEX "WorkOrderFault_catalogId_idx" ON "WorkOrderFault"("catalogId");

UPDATE "WorkOrder" AS repair
SET "inspectionMode" = true,
    "inspectionFee" = diagnostic."final"
FROM "WorkOrderItem" AS diagnostic
WHERE diagnostic."orderId" = repair."id"
  AND repair."status" = 'DIAGNOSING'
  AND diagnostic."matchLevel" = 'DIAGNOSTIC';

DELETE FROM "WorkOrderItem" AS diagnostic
USING "WorkOrder" AS repair
WHERE diagnostic."orderId" = repair."id"
  AND repair."inspectionMode" = true
  AND diagnostic."matchLevel" = 'DIAGNOSTIC';

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "category" ORDER BY "key") - 1 AS position
  FROM "FaultOption"
)
UPDATE "FaultOption" AS fault
SET "sortOrder" = ordered.position
FROM ordered
WHERE fault."id" = ordered."id";

DELETE FROM "FaultOption"
WHERE "key" IN ('da diagnosticare', '故障待检测');

INSERT INTO "FaultOption" ("id", "category", "name", "key", "sortOrder", "hidden")
SELECT
  md5(category || ':' || name),
  category,
  name,
  lower(name),
  position,
  false
FROM (VALUES
  ('PHONE'), ('TABLET'), ('LAPTOP'), ('DESKTOP'),
  ('CONSOLE'), ('SMARTWATCH'), ('SMARTBAND'), ('OTHER')
) AS categories(category)
CROSS JOIN (VALUES
  ('Non si accende', 0),
  ('Alimentazione / ricarica', 1),
  ('Riavvio improvviso', 2),
  ('Lento / bloccato', 3),
  ('Surriscaldamento', 4),
  ('Danno da liquido', 5),
  ('Danno da caduta', 6)
) AS faults(name, position)
ON CONFLICT ("category", "key") DO NOTHING;

INSERT INTO "FaultOption" ("id", "category", "name", "key", "sortOrder", "hidden")
SELECT md5(category || ':' || name), category, name, lower(name), position, false
FROM (VALUES ('PHONE'), ('TABLET')) AS categories(category)
CROSS JOIN (VALUES
  ('Display rotto', 10), ('Display nero / anomalo', 11),
  ('Touch non funzionante', 12), ('Batteria dura poco', 13),
  ('Fotocamera difettosa', 14), ('Audio / microfono', 15),
  ('Tasti difettosi', 16), ('SIM / rete mobile', 17),
  ('Wi-Fi / Bluetooth', 18)
) AS faults(name, position)
ON CONFLICT ("category", "key") DO NOTHING;
