import { describe, expect, it } from "vitest";
import {
  orderInput,
  editInput,
  quickServiceExpectedAtInput,
} from "@/lib/validation";
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
  it("validates a quick-service date and time while allowing it to be cleared", () => {
    expect(
      quickServiceExpectedAtInput.safeParse("2099-12-31T18:30").success,
    ).toBe(true);
    expect(quickServiceExpectedAtInput.safeParse("").success).toBe(true);
    expect(quickServiceExpectedAtInput.safeParse("2099-12-31").success).toBe(
      false,
    );
  });
});
