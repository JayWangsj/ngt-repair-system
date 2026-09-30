CREATE TABLE "BusinessClock" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'SYSTEM',
    "manualDate" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessClock_pkey" PRIMARY KEY ("id")
);
