import { describe, it, expect } from "vitest";
import { customerInput, orderInput } from "@/lib/validation";
import { deviceProjects, uniqueOptions } from "@/lib/options";
import { normalizeBrand, normalizeModel } from "@/lib/catalog";
describe("customer phone validation", () => {
  it("normalizes up to three numbers and rejects duplicate, invalid or excess numbers", () => {
    const input = {
      name: " Test ",
      phone: "333 123 4567",
      additionalPhones: ["3331234568", "3331234569"],
    };
    expect(customerInput.parse(input).phone).toBe("+393331234567");
    expect(
      customerInput.safeParse({ ...input, additionalPhones: ["3331234567"] })
        .success,
    ).toBe(false);
    expect(
      customerInput.safeParse({ ...input, additionalPhones: ["bad"] }).success,
    ).toBe(false);
    expect(
      customerInput.safeParse({
        ...input,
        additionalPhones: [...input.additionalPhones, "3331234570"],
      }).success,
    ).toBe(false);
    expect(
      orderInput.shape.additionalPhones.safeParse([
        "3331234568",
        "3331234569",
        "3331234570",
      ]).success,
    ).toBe(false);
  });
  it("normalizes saved brand and model names", () => {
    expect(normalizeBrand(" apple ")).toBe("Apple");
    expect(normalizeBrand("SAMSUNG")).toBe("Samsung");
    expect(normalizeModel("iphone 16 pro max")).toBe("iPhone 16 Pro Max");
    expect(normalizeModel("a17")).toBe("A17");
    expect(normalizeModel("galaxy a17")).toBe("Galaxy a17");
  });
});
describe("device-specific suggestions", () => {
  it("only lists saved projects for the matching brand and model", () => {
    const rules = [
      {
        category: "PHONE",
        brand: "apple",
        model: "iphone 13",
        project: "Display",
        enabled: true,
      },
      {
        category: "PHONE",
        brand: "apple",
        model: "iphone 13",
        project: "display",
        enabled: true,
      },
      {
        category: "PHONE",
        brand: "apple",
        model: "iphone 14",
        project: "Battery",
        enabled: true,
      },
      {
        category: "PHONE",
        brand: "samsung",
        model: "iphone 13",
        project: "Other",
        enabled: true,
      },
      {
        category: "PHONE",
        brand: "apple",
        model: "iphone 13",
        project: "Hidden",
        enabled: false,
      },
    ];
    expect(
      deviceProjects(rules, {
        category: "PHONE",
        brand: " Apple ",
        model: "iPhone 13",
      }),
    ).toEqual(["display"]);
    expect(
      deviceProjects(rules, {
        category: "PHONE",
        brand: "apple",
        model: "new",
      }),
    ).toEqual([]);
    expect(
      deviceProjects(rules, {
        category: "TABLET",
        brand: "Apple",
        model: "iPhone 13",
      }),
    ).toEqual([]);
    expect(uniqueOptions(["Apple", "apple", "Samsung", ""])).toEqual([
      "apple",
      "Samsung",
    ]);
  });
});
