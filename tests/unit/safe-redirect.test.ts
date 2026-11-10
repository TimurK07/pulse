import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("защита от открытого редиректа", () => {
  it("пропускает внутренние пути", () => {
    expect(safeNext("/issues/A-003")).toBe("/issues/A-003");
    expect(safeNext("/queue?view=overdue")).toBe("/queue?view=overdue");
  });
  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/api/me", "/login", "/a\nb", 42, undefined])(
    "отклоняет %s",
    (v) => expect(safeNext(v)).toBe("/"),
  );
});
