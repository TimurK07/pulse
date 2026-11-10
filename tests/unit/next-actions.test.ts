import { describe, expect, it } from "vitest";
import { buildActions, type WithSla } from "@/lib/next-actions";
import type { IssueListItem } from "@/lib/services/issues";
import type { SlaInfo } from "@/lib/sla";

const NOW = new Date("2026-11-10T12:00:00Z").getTime();
const H = 3600_000;

function issue(code: string, over: Partial<IssueListItem> = {}): IssueListItem {
  return {
    id: code, code, type: "PROBLEM", title: `Обращение ${code}`, status: "NEW", priority: "MEDIUM",
    category: { id: "c", name: "К" }, department: null, assignee: { id: "u1", name: "Роман Козлов", title: "IT" }, author: null,
    isAnonymous: false, isOwn: false, createdAt: new Date(NOW - 48 * H).toISOString(), updatedAt: new Date(NOW - 48 * H).toISOString(),
    firstResponseDueAt: new Date(NOW - H).toISOString(), firstResponseAt: null, dueAt: new Date(NOW + 100 * H).toISOString(), resolvedAt: null,
    supportersCount: 0, commentsCount: 0, attachmentsCount: 0, ...over,
  };
}
const sla = (msLeft: number, phase: SlaInfo["phase"] = "first_response"): SlaInfo => ({
  state: msLeft < 0 ? "overdue" : "ok", phase, msLeft, deadline: new Date(NOW + msLeft), firstResponseOverdue: msLeft < 0 && phase === "first_response", resolutionOverdue: msLeft < 0 && phase === "resolution",
});

describe("«Что сделать сейчас» на Пульсе", () => {
  it("сначала самые давние просрочки, с фазой срока и ответственным", () => {
    const overdue: WithSla[] = [
      { i: issue("A-001"), s: sla(-30 * H, "resolution") },
      { i: issue("A-002"), s: sla(-2 * H) },
    ];
    const acts = buildActions({ overdue, unassigned: [], waiting: [] }, { byAssignee: [], themes: [] }, NOW);
    expect(acts[0].title).toBe("A-001: просрочено решение");
    expect(acts[0].detail).toContain("1 д 6 ч");
    expect(acts[1].title).toBe("A-002: нет первой реакции");
    expect(acts.every((a) => a.href.startsWith("/"))).toBe(true);
  });

  it("назначение, перегрузка, молчащий автор, тема — и не больше пяти шагов", () => {
    const overdue: WithSla[] = [1, 2, 3].map((n) => ({ i: issue(`A-00${n}`), s: sla(-n * H) }));
    const acts = buildActions(
      {
        overdue,
        unassigned: [issue("A-010", { assignee: null })],
        waiting: [{ i: issue("A-011", { status: "NEEDS_INFO", updatedAt: new Date(NOW - 5 * 24 * H).toISOString() }), s: sla(10 * H, "resolution") }],
      },
      {
        byAssignee: [{ id: "u1", name: "Роман Козлов", title: "IT", open: 3, overdue: 2, resolved: 0, avgResponseHours: null }],
        themes: [{ key: "t", title: "Прозрачность статусов", issueIds: [], codes: ["A-1", "A-2", "A-3"], categories: [], departments: [], openCount: 3, supporters: 4, statuses: [] }],
      },
      NOW,
    );
    expect(acts).toHaveLength(5);
    expect(acts.map((a) => a.key)).toEqual(["od-A-001", "od-A-002", "un-A-010", "ld-u1", "wt-A-011"]);
    expect(acts.find((a) => a.key === "wt-A-011")?.title).toBe("Автор A-011 не отвечает 5 дней");
  });

  it("нет проблем — нет шагов", () => {
    expect(buildActions({ overdue: [], unassigned: [], waiting: [] }, { byAssignee: [], themes: [] }, NOW)).toEqual([]);
  });
});
