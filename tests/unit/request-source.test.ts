import { describe, expect, it } from "vitest";
import { isSameOriginWriteRequest } from "@/lib/request-source";

const endpoint = "http://localhost:3000/api/work-orders/test/status";

describe("same-origin write source validation", () => {
  it("accepts requests from the same origin", () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isSameOriginWriteRequest(request)).toBe(true);
  });

  it("rejects a foreign origin or a cross-site fetch", () => {
    const foreignOrigin = new Request(endpoint, {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const crossSite = new Request(endpoint, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site" },
    });

    expect(isSameOriginWriteRequest(foreignOrigin)).toBe(false);
    expect(isSameOriginWriteRequest(crossSite)).toBe(false);
  });

  it("allows clients that do not send browser source headers", () => {
    expect(
      isSameOriginWriteRequest(new Request(endpoint, { method: "POST" })),
    ).toBe(true);
  });
});
