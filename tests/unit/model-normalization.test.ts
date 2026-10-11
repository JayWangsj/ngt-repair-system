import { describe, expect, it } from "vitest";
import { modelKey, normalizeDeviceModel, normalizeModel } from "@/lib/catalog";

describe("model normalization", () => {
  it("prefers the current brand catalog display name", () => {
    expect(normalizeModel("galaxy-a17", ["Galaxy A17"])).toBe("Galaxy A17");
    expect(modelKey("Pixel 9 Pro")).toBe(modelKey("pixel-9pro"));
  });

  it("formats only high-confidence custom names", () => {
    expect(normalizeModel("iphoneduo")).toBe("iPhone Duo");
    expect(normalizeModel("iphone18promax")).toBe("iPhone 18 Pro Max");
    expect(normalizeModel("galaxys24ultra")).toBe("Galaxy S24 Ultra");
    expect(normalizeModel("X200")).toBe("X200");
    expect(normalizeModel("13T")).toBe("13T");
    expect(normalizeDeviceModel("Samsung", "galaxya265g")).toBe(
      "Galaxy A26 5G",
    );
  });
});
