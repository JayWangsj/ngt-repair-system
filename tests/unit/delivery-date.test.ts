import { describe, expect, it } from "vitest";
import { orderInput, editInput } from "@/lib/validation";
describe("delivery date", () => {
  it.each([orderInput.shape.dueDate, editInput.shape.dueDate])(
    "validates delivery date syntax for create and edit",
    (schema) => {
      expect(schema.safeParse("2026-09-22").success).toBe(true);
      expect(schema.safeParse("2026-09-23").success).toBe(true);
      expect(schema.safeParse("2026-09-24").success).toBe(true);
      expect(schema.safeParse("").success).toBe(true);
      expect(schema.safeParse("2026-02-30").success).toBe(false);
    },
  );
});
