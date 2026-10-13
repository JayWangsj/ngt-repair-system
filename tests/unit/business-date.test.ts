import { describe, expect, it } from "vitest";
import {
  resolveBusinessDay,
  romeDateRange,
  validBusinessDate,
} from "@/lib/business-date";

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

  it("uses Rome midnight boundaries across daylight-saving changes", () => {
    const spring = romeDateRange("2026-03-29", "2026-03-30");
    const autumn = romeDateRange("2026-10-25", "2026-10-26");
    expect(spring.gte.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(spring.lt.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(autumn.gte.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(autumn.lt.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});
