import { describe, expect, it } from "vitest";
import { slaPolicySchema } from "@/lib/validation";

describe("норматив сроков", () => {
  it("принимает согласованные значения", () => {
    expect(slaPolicySchema.safeParse({ priority: "HIGH", firstResponseHours: 24, resolutionDays: 7 }).success).toBe(true);
    expect(slaPolicySchema.safeParse({ priority: "LOW", firstResponseHours: 24, resolutionDays: 1 }).success).toBe(true);
  });
  it("реакция не может быть дольше решения", () => {
    const r = slaPolicySchema.safeParse({ priority: "LOW", firstResponseHours: 720, resolutionDays: 1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Срок первой реакции не может быть дольше срока решения");
  });
});
