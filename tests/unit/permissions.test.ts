import { describe, expect, it } from "vitest";
import { authorVisible, canReassign, issueAccess } from "@/lib/permissions";

const issue = { authorId: "author", assigneeId: "h1", categoryId: "cat1", departmentId: "d1", isPrivate: false, isAnonymous: false, status: "NEW" as const };
const ctx = { handledCategoryIds: [], headOfDepartmentId: null };

describe("права доступа к обращению", () => {
  it("автор видит своё как автор", () => {
    expect(issueAccess({ id: "author", role: "EMPLOYEE", departmentId: "d1" }, issue, ctx)).toBe("author");
  });
  it("посторонний сотрудник не видит", () => {
    expect(issueAccess({ id: "x", role: "EMPLOYEE", departmentId: "d1" }, issue, ctx)).toBe("none");
  });
  it("поддержавший видит публичную версию, но не приватное обращение", () => {
    expect(issueAccess({ id: "x", role: "EMPLOYEE", departmentId: null }, issue, { ...ctx, isSupporter: true })).toBe("public");
    expect(issueAccess({ id: "x", role: "EMPLOYEE", departmentId: null }, { ...issue, isPrivate: true }, { ...ctx, isSupporter: true })).toBe("none");
  });
  it("ответственный: назначенные и свои категории", () => {
    expect(issueAccess({ id: "h1", role: "HANDLER", departmentId: null }, issue, ctx)).toBe("handler");
    expect(issueAccess({ id: "h2", role: "HANDLER", departmentId: null }, issue, { ...ctx, handledCategoryIds: ["cat1"] })).toBe("handler");
    expect(issueAccess({ id: "h2", role: "HANDLER", departmentId: null }, issue, ctx)).toBe("none");
  });
  it("руководитель подразделения не видит анонимные обращения своей команды", () => {
    const head = { id: "head", role: "HANDLER" as const, departmentId: "d1" };
    expect(issueAccess(head, issue, { ...ctx, headOfDepartmentId: "d1" })).toBe("handler");
    expect(issueAccess(head, { ...issue, isAnonymous: true }, { ...ctx, headOfDepartmentId: "d1" })).toBe("none");
  });
  it("руководитель направления видит всё", () => {
    expect(issueAccess({ id: "m", role: "MANAGER", departmentId: null }, { ...issue, isPrivate: true }, ctx)).toBe("handler");
  });
  it("анонимность скрывает автора от обработчиков, но не от него самого", () => {
    expect(authorVisible("handler", true, false)).toBe(false);
    expect(authorVisible("author", true, true)).toBe(true);
    expect(authorVisible("public", false, false)).toBe(false);
  });
  it("переназначение: руководитель — любого, ответственный — только себя", () => {
    expect(canReassign({ id: "m", role: "MANAGER", departmentId: null }, "handler", "anyone")).toBe(true);
    expect(canReassign({ id: "h", role: "HANDLER", departmentId: null }, "handler", "h")).toBe(true);
    expect(canReassign({ id: "h", role: "HANDLER", departmentId: null }, "handler", "other")).toBe(false);
  });
});
