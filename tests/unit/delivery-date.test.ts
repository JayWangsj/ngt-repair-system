import { afterEach, describe, expect, it, vi } from "vitest";
import { orderInput, editInput } from "@/lib/validation";
afterEach(() => vi.useRealTimers());
describe("delivery date", () => {
  it.each([orderInput.shape.dueDate, editInput.shape.dueDate])(
    "rejects past dates using the Rome calendar for create and edit",
    (schema) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-22T22:30:00Z"));
      expect(schema.safeParse("2026-09-22").success).toBe(false);
      expect(schema.safeParse("2026-09-23").success).toBe(true);
      expect(schema.safeParse("2026-09-24").success).toBe(true);
      expect(schema.safeParse("").success).toBe(true);
      expect(schema.safeParse("2026-02-30").success).toBe(false);
    },
  );
});
