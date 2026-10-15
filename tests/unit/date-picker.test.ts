import { describe, expect, it } from "vitest";
import {
  addDays,
  dateParts,
  dateTimeSerial,
  daysInMonth,
  formatMonthValue,
  hasAllowedDateTimeOnDay,
  isoDate,
  isAllowedValue,
  isAllowedYear,
  monthParts,
  shiftMonth,
} from "@/lib/date-picker";

describe("shared date-picker rules", () => {
  it("formats month values using the interface locale", () => {
    expect(formatMonthValue("2026-10", "it-IT")).toBe("ottobre 2026");
    expect(formatMonthValue("2026-10", "zh-CN")).toBe("2026年10月");
    expect(formatMonthValue("2026-13", "it-IT")).toBe("");
  });

  it("parses leap days and keeps pure date arithmetic timezone-free", () => {
    expect(dateParts("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(dateParts("2025-02-29")).toBeNull();
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(isoDate(addDays({ year: 2026, month: 12, day: 31 }, 1))).toBe(
      "2027-01-01",
    );
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("applies date and month bounds and native step bases", () => {
    expect(
      isAllowedValue("2026-10-14", {
        type: "date",
        min: "2026-10-14",
        max: "2026-10-20",
        step: 2,
      }),
    ).toBe(true);
    expect(
      isAllowedValue("2026-10-15", {
        type: "date",
        min: "2026-10-14",
        max: "2026-10-20",
        step: 2,
      }),
    ).toBe(false);
    expect(
      isAllowedValue("2024-02", {
        type: "month",
        min: "2024-02",
        max: "2024-04",
        step: 2,
      }),
    ).toBe(true);
    expect(
      isAllowedValue("2024-03", {
        type: "month",
        min: "2024-02",
        max: "2024-04",
        step: 2,
      }),
    ).toBe(false);
    expect(monthParts("2026-13")).toBeNull();
  });

  it("checks complete datetime bounds and step in seconds", () => {
    const rules = {
      type: "datetime-local" as const,
      min: "2026-10-14T15:00",
      max: "2026-10-14T16:00",
      step: 300,
    };
    expect(isAllowedValue("2026-10-14T14:55", rules)).toBe(false);
    expect(isAllowedValue("2026-10-14T15:00", rules)).toBe(true);
    expect(isAllowedValue("2026-10-14T15:05", rules)).toBe(true);
    expect(isAllowedValue("2026-10-14T15:06", rules)).toBe(false);
    expect(isAllowedValue("2026-10-14T16:05", rules)).toBe(false);
    expect(
      isAllowedValue("2026-10-14T15:15", {
        ...rules,
        step: 900,
      }),
    ).toBe(true);
    expect(
      isAllowedValue("2026-10-14T15:05", {
        ...rules,
        step: 900,
      }),
    ).toBe(false);
    expect(
      hasAllowedDateTimeOnDay({ year: 2026, month: 10, day: 14 }, rules),
    ).toBe(true);
    expect(
      isAllowedValue("2026-10-14T09:00", {
        type: "datetime-local",
        min: "2026-10-14T15:00",
      }),
    ).toBe(false);
    expect(
      dateTimeSerial("2026-10-14T15:05:00")! -
        dateTimeSerial("2026-10-14T15:00")!,
    ).toBe(300_000);
  });

  it("finds available years and months without restricting distant dates", () => {
    const rules = {
      type: "month" as const,
      min: "2020-06",
      max: "2035-02",
    };
    expect(isAllowedYear(2019, rules)).toBe(false);
    expect(isAllowedYear(2020, rules)).toBe(true);
    expect(isAllowedYear(2030, rules)).toBe(true);
    expect(isAllowedYear(2036, rules)).toBe(false);
    expect(isAllowedYear(1, { type: "date" })).toBe(true);
    expect(isAllowedYear(9999, { type: "date" })).toBe(true);
  });

  it("uses a stable native step base when no minimum is supplied", () => {
    expect(isAllowedValue("1970-01-03", { type: "date", step: 2 })).toBe(true);
    expect(isAllowedValue("1970-01-02", { type: "date", step: 2 })).toBe(false);
    expect(
      isAllowedValue("1970-01-01T00:05", {
        type: "datetime-local",
        step: 300,
        stepBase: "1970-01-01T00:00",
      }),
    ).toBe(true);
  });
});
