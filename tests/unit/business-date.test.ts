import { describe, expect, it } from "vitest";
import { resolveBusinessDay, validBusinessDate } from "@/lib/business-date";

describe("business date", () => {
  it("uses a valid manual date", () => {
    expect(
      resolveBusinessDay(
        { mode: "MANUAL", manualDate: "2030-05-06" },
        new Date("2026-09-30T10:00:00Z"),
      ),
    ).toBe("2030-05-06");
  });

  it("falls back to the Rome system day", () => {
    expect(
      resolveBusinessDay(
        { mode: "SYSTEM", manualDate: "2030-05-06" },
        new Date("2026-09-30T23:30:00Z"),
      ),
    ).toBe("2026-10-01");
  });

  it("rejects normalized or impossible dates", () => {
    expect(validBusinessDate("2026-02-29")).toBe(false);
    expect(validBusinessDate("2026-2-03")).toBe(false);
  });
});
