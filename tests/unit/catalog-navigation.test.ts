import { describe, it, expect } from "vitest";
import { categories, brands } from "@/lib/catalog";
import { orderInput, ruleInput, deviceInput } from "@/lib/validation";
import { groupPriceRules } from "@/lib/options";
describe("wearable device categories", () => {
  it.each(["SMARTWATCH", "SMARTBAND"] as const)(
    "accepts %s across all forms",
    (category) => {
      expect(categories[category]).toHaveLength(2);
      expect(brands[category].length).toBeGreaterThan(0);
      expect(orderInput.shape.category.parse(category)).toBe(category);
      expect(
        ruleInput.parse({
          category,
          brand: "Apple",
          model: "Wearable",
          project: "Battery",
          suggested: "20",
        }).category,
      ).toBe(category);
      expect(
        deviceInput.parse({ category, brand: "Apple", model: "Wearable" })
          .category,
      ).toBe(category);
    },
  );
});
describe("quote navigation", () => {
  const rules = [
    {
      brand: "Apple",
      category: "PHONE",
      model: "iPhone 18 Pro Max",
      project: "Screen",
    },
    { brand: "Samsung", category: "PHONE", model: "Galaxy", project: "Screen" },
    {
      brand: "apple",
      category: "PHONE",
      model: "iPhone 18 Pro Max",
      project: "Battery",
    },
    {
      brand: "Apple",
      category: "SMARTWATCH",
      model: "Watch",
      project: "Battery",
    },
  ];
  it("groups unsorted quotes by brand, device type and model", () => {
    const groups = groupPriceRules(rules);
    expect(groups).toHaveLength(2);
    expect(groups[0].categories).toHaveLength(2);
    expect(groups[0].categories[0].models[0].rules).toHaveLength(2);
  });
  it("matches brand, model and project without case sensitivity", () => {
    expect(groupPriceRules(rules, " APPLE ")).toHaveLength(1);
    expect(
      groupPriceRules(rules, "18 pro")[0].categories[0].models[0].rules,
    ).toHaveLength(2);
    expect(groupPriceRules(rules, "battery")[0].categories).toHaveLength(2);
    expect(groupPriceRules(rules, "missing")).toEqual([]);
  });
  it("drops empty models, categories and brands after deletion", () => {
    expect(
      groupPriceRules(rules.filter((r) => r.category !== "PHONE"))[0]
        .categories,
    ).toHaveLength(1);
    expect(groupPriceRules([])).toEqual([]);
  });
  it("retains generic quotes without inventing a device model", () => {
    expect(
      groupPriceRules([
        { brand: "", category: "PHONE", model: "", project: "Check" },
      ])[0].categories[0].models[0].model,
    ).toBe("");
  });
});
