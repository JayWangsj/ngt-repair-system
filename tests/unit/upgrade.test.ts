import { describe, it, expect } from "vitest";
import { settlement, balance } from "@/lib/domain";
import { messages, localeOf, translateError } from "@/lib/i18n";
import { categories, faultPresets, faultLabel } from "@/lib/catalog";
describe("discounts and fixed IVA", () => {
  const items = [
    { final: "100", discount: "10" },
    { final: "50", discount: "0" },
  ];
  it("combines discounts once and toggles only IVA receivable", () => {
    expect(settlement(items, { orderDiscount: "5" })).toEqual({
      gross: 15000,
      discount: 1500,
      net: 13500,
      vat: 2970,
      withVat: 16470,
      productTotal: 0,
      due: 13500,
    });
    expect(
      balance(items, [{ amount: "20" }], {
        orderDiscount: "5",
        includeVat: true,
      }),
    ).toBe(14470);
    expect(balance(items, [{ amount: "20" }], { orderDiscount: "5" })).toBe(
      11500,
    );
  });
  it("rounds IVA once on the discounted total", () => {
    expect(
      settlement([{ final: "0.03" }, { final: "0.03" }], { includeVat: true })
        .vat,
    ).toBe(1);
    expect(settlement([{ final: "0.25" }], { includeVat: true }).vat).toBe(6);
  });
  it("accepts zero totals, rejects excessive and invalid discounts", () => {
    expect(
      settlement([{ final: "10", discount: "10" }], { includeVat: true }).due,
    ).toBe(0);
    for (const discount of ["-1", "10.01", "1.001"])
      expect(() => settlement([{ final: "10", discount }])).toThrow();
    expect(() => settlement(items, { orderDiscount: "141" })).toThrow();
  });
  it("leaves legacy quotes unchanged when new fields are absent", () => {
    expect(balance([{ final: "100" }], [{ amount: "20" }])).toBe(8000);
  });
});
describe("bilingual dictionaries", () => {
  function keys(o: object, p = ""): string[] {
    return Object.entries(o).flatMap(([k, v]) =>
      typeof v === "string" ? [p + k] : keys(v, p + k + "."),
    );
  }
  it("has complete Chinese keys and safe locale fallback", () => {
    expect(keys(messages.zh).sort()).toEqual(keys(messages.it).sort());
    expect(localeOf("zh")).toBe("zh");
    expect(localeOf("unknown")).toBe("it");
    expect(translateError("Lo sconto supera il prezzo.", "zh")).toBe(
      "优惠金额不能超过原价。",
    );
  });
  it("keeps stable fault identities and custom text in either language", () => {
    expect(faultLabel("Display rotto; 自定义故障", "zh")).toBe(
      "屏幕破裂；自定义故障",
    );
    for (const category of Object.keys(
      categories,
    ) as (keyof typeof categories)[]) {
      const options = faultPresets(category);
      expect(new Set(options.map((o) => o[0])).size).toBe(options.length);
      expect(options.every((o) => o[0] && o[1])).toBe(true);
    }
  });
});
