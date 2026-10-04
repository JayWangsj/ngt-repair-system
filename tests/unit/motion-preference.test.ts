import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAlwaysMotionEnabled,
  MOTION_PREFERENCE_KEY,
  prefersReducedMotion,
  setAlwaysMotionEnabled,
} from "@/lib/motion-preference";

function installBrowser(reducedMotion: boolean) {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    matchMedia: () => ({ matches: reducedMotion }),
  });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("interface motion preference", () => {
  it("follows the system preference by default", () => {
    installBrowser(true);
    expect(isAlwaysMotionEnabled()).toBe(false);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("can force animations independently on the current browser", () => {
    const values = installBrowser(true);
    setAlwaysMotionEnabled(true);
    expect(values.get(MOTION_PREFERENCE_KEY)).toBe("always");
    expect(document.documentElement.dataset.motion).toBe("always");
    expect(prefersReducedMotion()).toBe(false);

    setAlwaysMotionEnabled(false);
    expect(values.has(MOTION_PREFERENCE_KEY)).toBe(false);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(prefersReducedMotion()).toBe(true);
  });
});
