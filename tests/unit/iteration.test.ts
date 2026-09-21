import { describe, it, expect } from "vitest";
import { customerInput, orderInput } from "@/lib/validation";
import { deviceProjects, uniqueOptions } from "@/lib/options";
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
});
describe("device-specific suggestions", () => {
  it("only lists saved projects for the matching brand and model", () => {
    const rules = [
      { brand: "apple", model: "iphone 13", project: "Display", enabled: true },
      { brand: "apple", model: "iphone 13", project: "display", enabled: true },
      { brand: "apple", model: "iphone 14", project: "Battery", enabled: true },
      { brand: "samsung", model: "iphone 13", project: "Other", enabled: true },
      { brand: "apple", model: "iphone 13", project: "Hidden", enabled: false },
    ];
    expect(
      deviceProjects(rules, { brand: " Apple ", model: "iPhone 13" }),
    ).toEqual(["display"]);
    expect(deviceProjects(rules, { brand: "apple", model: "new" })).toEqual([]);
    expect(uniqueOptions(["Apple", "apple", "Samsung", ""])).toEqual([
      "apple",
      "Samsung",
    ]);
  });
});
