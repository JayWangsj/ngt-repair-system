import { describe, expect, it } from "vitest";
import {
  recentRomeDays,
  revenueSeries,
  summarizePayments,
} from "@/lib/business-metrics";

describe("business metrics", () => {
  const payments = [
    {
      amount: "145",
      method: "CASH" as const,
      receivedAt: "2026-09-24T10:00:00Z",
      orderId: "order",
      allocations: [
        { source: "REPAIR" as const, amount: "120" },
        { source: "RETAIL" as const, amount: "25" },
      ],
    },
    {
      amount: "15",
      method: "TRANSFER" as const,
      receivedAt: "2026-09-24T12:00:00Z",
      saleId: "legacy-sale",
    },
  ];

  it("uses allocations and groups legacy transfer under other", () => {
    expect(summarizePayments(payments, "2026-09-24")).toEqual({
      total: 16000,
      repair: 12000,
      retail: 4000,
      methods: { CASH: 14500, CARD: 0, OTHER: 1500 },
    });
  });

  it("creates a stable seven-day series ending on the selected Rome day", () => {
    expect(recentRomeDays("2026-03-30", 3)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(revenueSeries(payments, "2026-09-24", 2)[1]).toMatchObject({
      day: "2026-09-24",
      total: 16000,
      repair: 12000,
      retail: 4000,
    });
  });
});
