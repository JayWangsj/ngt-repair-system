import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySidebarPreference,
  clampSidebarWidth,
  readSidebarPreference,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
  writeSidebarPreference,
} from "@/lib/sidebar-preference";
import {
  AUTO_UPDATE_CHECK_KEY,
  readAutoUpdateCheck,
  writeAutoUpdateCheck,
} from "@/lib/update-preference";

function installBrowser() {
  const values = new Map<string, string>();
  const style = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (key: string, value: string) => style.set(key, value),
      },
    },
  });
  return { values, style };
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace preferences", () => {
  it("clamps, persists and restores the desktop sidebar", () => {
    const { values, style } = installBrowser();
    expect(clampSidebarWidth(120)).toBe(180);
    expect(clampSidebarWidth(400)).toBe(320);
    writeSidebarPreference(296, true);
    expect(values.get(SIDEBAR_WIDTH_KEY)).toBe("296");
    expect(values.get(SIDEBAR_COLLAPSED_KEY)).toBe("true");
    expect(style.get("--sidebar-width")).toBe("64px");
    expect(readSidebarPreference()).toEqual({ width: 296, collapsed: true });
    applySidebarPreference(296, false);
    expect(style.get("--sidebar-width")).toBe("296px");
  });

  it("checks at startup by default and persists an opt-out", () => {
    const { values } = installBrowser();
    expect(readAutoUpdateCheck()).toBe(true);
    writeAutoUpdateCheck(false);
    expect(values.get(AUTO_UPDATE_CHECK_KEY)).toBe("false");
    expect(readAutoUpdateCheck()).toBe(false);
  });
});
