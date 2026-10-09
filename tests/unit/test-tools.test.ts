import { describe, expect, it } from "vitest";
import { isTestToolsEnabled } from "@/lib/test-tools-guard";
import {
  defaultOrderMotionSettings,
  normalizeOrderMotionSettings,
} from "@/lib/order-motion";

describe("test tools", () => {
  it("requires both the explicit switch and the exact ngt_test database", () => {
    expect(
      isTestToolsEnabled({
        NGT_TEST_TOOLS: "true",
        DATABASE_URL: "postgresql://ngt:test@127.0.0.1:55433/ngt_test",
      }),
    ).toBe(true);
    expect(
      isTestToolsEnabled({
        NGT_TEST_TOOLS: "false",
        DATABASE_URL: "postgresql://ngt:test@127.0.0.1:55433/ngt_test",
      }),
    ).toBe(false);
    expect(
      isTestToolsEnabled({
        NGT_TEST_TOOLS: "true",
        DATABASE_URL: "postgresql://ngt:test@127.0.0.1:55432/ngt",
      }),
    ).toBe(false);
  });

  it("keeps animation parameters inside safe limits", () => {
    expect(
      normalizeOrderMotionSettings({ lift: 200, hold: -10, glide: 640 }),
    ).toEqual({
      ...defaultOrderMotionSettings,
      lift: 40,
      hold: 0,
      glide: 640,
    });
  });
});
