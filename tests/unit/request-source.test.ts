import { describe, expect, it } from "vitest";
import {
  isLoopbackRequest,
  isSameOriginRequest,
  isSameOriginWriteRequest,
} from "@/lib/request-source";

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

  it("accepts the browser origin when the request URL was normalized", () => {
    const request = new Request(endpoint, {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        referer: "http://127.0.0.1:3000/customers/test",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isSameOriginWriteRequest(request)).toBe(true);
  });

  it("rejects a foreign origin or a cross-site fetch", () => {
    const foreignOrigin = new Request(endpoint, {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://attacker.example",
      },
    });
    const crossSite = new Request(endpoint, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site" },
    });

    expect(isSameOriginWriteRequest(foreignOrigin)).toBe(false);
    expect(isSameOriginWriteRequest(crossSite)).toBe(false);
  });

  it("rejects writes without a browser source", () => {
    expect(
      isSameOriginWriteRequest(new Request(endpoint, { method: "POST" })),
    ).toBe(false);
  });

  it("rejects non-loopback hosts even when the origin matches the Host header", () => {
    const request = new Request("http://attacker.example/api/system-update", {
      method: "POST",
      headers: {
        host: "attacker.example",
        origin: "http://attacker.example",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isSameOriginWriteRequest(request)).toBe(false);
    expect(isLoopbackRequest(request)).toBe(false);
  });

  it("allows local health clients without browser headers", () => {
    expect(
      isLoopbackRequest(new Request("http://127.0.0.1:3000/api/health")),
    ).toBe(true);
  });

  it("requires same-origin evidence for sensitive reads as well", () => {
    const sameOrigin = new Request(
      "http://localhost:3000/api/system-update/status",
      { headers: { "sec-fetch-site": "same-origin" } },
    );
    const sameSite = new Request(
      "http://localhost:3000/api/system-update/status",
      { headers: { "sec-fetch-site": "same-site" } },
    );

    expect(isSameOriginRequest(sameOrigin)).toBe(true);
    expect(isSameOriginRequest(sameSite)).toBe(false);
  });

  it("rejects a foreign source on local read endpoints", () => {
    const request = new Request(
      "http://localhost:3000/api/system-update/status",
      {
        headers: {
          host: "localhost:3000",
          origin: "https://attacker.example",
        },
      },
    );

    expect(isLoopbackRequest(request)).toBe(false);
  });
});
