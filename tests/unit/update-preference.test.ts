import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readUpdateCheckCache,
  writeUpdateCheckCache,
} from "../../src/lib/update-preference";

function installSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal("window", { sessionStorage });
}

afterEach(() => vi.unstubAllGlobals());

describe("update check cache", () => {
  it("keeps a recent result scoped to its install instance and version", () => {
    installSessionStorage();
    const cache = {
      checkedAt: new Date().toISOString(),
      info: { currentVersion: "2.0.11", updateAvailable: false },
    };
    writeUpdateCheckCache("install-a", "2.0.11", cache);

    expect(readUpdateCheckCache("install-a", "v2.0.11")).toEqual(cache);
    expect(readUpdateCheckCache("install-b", "2.0.11")).toBeNull();
    expect(readUpdateCheckCache("install-a", "2.0.12")).toBeNull();
  });

  it("ignores expired or malformed results", () => {
    installSessionStorage();
    writeUpdateCheckCache("install-a", "2.0.11", {
      checkedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      info: { updateAvailable: false },
    });
    expect(readUpdateCheckCache("install-a", "2.0.11")).toBeNull();
    expect(readUpdateCheckCache("", "2.0.11")).toBeNull();
  });
});
