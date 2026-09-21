import { describe, it, expect } from "vitest";
import {
  assertDelivery,
  assertOwner,
  assertTransition,
  balance,
  cents,
  decimal,
  isOverdue,
  matchRule,
  normalizePhone,
  romeDay,
  total,
} from "@/lib/domain";
import { orderInput, ruleInput } from "@/lib/validation";
const staff = { id: "s", name: "Staff", role: "STAFF" as const };
const owner = { ...staff, role: "OWNER" as const };
describe("integer money", () => {
  it("handles euro cents exactly", () => {
    expect(total([{ final: "0.1" }, { final: "0.2" }])).toBe(30);
    expect(cents("12,05")).toBe(1205);
    expect(decimal(1205)).toBe("12.05");
    expect(balance([{ final: "10" }], [{ amount: "2.99" }])).toBe(701);
  });
  it.each(["-1", "NaN", "1.001", "1e2", "Infinity", "100000000", "", "1.2.3"])(
    "rejects invalid money %s",
    (value) => expect(() => cents(value)).toThrow(),
  );
});
describe("quote matching", () => {
  const device = { brand: "Apple", series: "iPhone", model: "iPhone 13" };
  const rules = [
    {
      id: "generic",
      brand: "",
      series: "",
      model: "",
      project: "Display",
      enabled: true,
    },
    {
      id: "series",
      brand: "Apple",
      series: "iPhone",
      model: "",
      project: "Display",
      enabled: true,
    },
    {
      id: "exact",
      brand: "Apple",
      series: "",
      model: "iPhone 13",
      project: "Display",
      enabled: true,
    },
  ];
  it("prefers exact model, then series, then generic", () => {
    expect(matchRule(rules, device, " display ")?.rule.id).toBe("exact");
    expect(matchRule(rules.slice(0, 2), device, "Display")?.rule.id).toBe(
      "series",
    );
    expect(matchRule(rules.slice(0, 1), device, "Display")?.level).toBe(
      "GENERIC",
    );
  });
  it("ignores inactive and other brands", () => {
    expect(
      matchRule(
        rules.map((r) => ({ ...r, enabled: false })),
        device,
        "Display",
      ),
    ).toBeNull();
    expect(
      matchRule(rules, { ...device, brand: "Samsung" }, "Display")?.rule.id,
    ).toBe("generic");
    expect(matchRule(rules, device, "Camera")).toBeNull();
  });
});
describe("status and permissions", () => {
  it("requires allowed transitions and terminal states remain closed", () => {
    expect(() => assertTransition("RECEIVED", "COMPLETED")).toThrow();
    expect(() => assertTransition("COMPLETED", "REPAIRING")).toThrow();
    expect(() => assertTransition("CANCELLED", "RECEIVED")).toThrow();
    expect(() => assertTransition("REPAIRING", "READY")).not.toThrow();
  });
  it("requires explicit owner confirmation for unpaid delivery", () => {
    expect(() => assertDelivery(staff, 100, true)).toThrow();
    expect(() => assertDelivery(owner, 100, false)).toThrow();
    expect(() => assertDelivery(owner, 100, true)).not.toThrow();
    expect(() => assertDelivery(staff, 0, false)).not.toThrow();
    expect(() => assertOwner(staff)).toThrow();
  });
});
describe("Italian localization and validation", () => {
  it("normalizes national and international phones without dropping Italian leading zero", () => {
    expect(normalizePhone("333 123 4567")).toBe("+393331234567");
    expect(normalizePhone("0039 02-1234567")).toBe("+39021234567");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });
  it("uses Rome day across UTC midnight and daylight saving", () => {
    expect(romeDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(romeDay(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
  });
  it("excludes closed orders from overdue", () => {
    expect(
      isOverdue({ status: "READY", dueDate: "2026-01-01" }, "2026-01-02"),
    ).toBe(true);
    expect(
      isOverdue({ status: "COMPLETED", dueDate: "2026-01-01" }, "2026-01-02"),
    ).toBe(false);
    expect(
      isOverdue({ status: "READY", dueDate: "2026-01-02" }, "2026-01-02"),
    ).toBe(false);
  });
  it("rejects ambiguous quote scopes", () => {
    expect(
      ruleInput.safeParse({
        brand: "Apple",
        project: "Display",
        suggested: "10",
        minutes: 30,
        enabled: true,
      }).success,
    ).toBe(false);
  });
  it("rejects an impossible due date", () => {
    expect(orderInput.shape.dueDate.safeParse("2026-02-30").success).toBe(
      false,
    );
  });
});
