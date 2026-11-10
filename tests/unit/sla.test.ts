import { describe, expect, it } from "vitest";
import { computeDeadlines, formatDuration, slaInfo } from "@/lib/sla";

const H = 3600_000;
const base = new Date("2026-11-02T09:00:00Z");

describe("SLA", () => {
  it("считает сроки по приоритету", () => {
    const d = computeDeadlines(base, "HIGH");
    expect(d.firstResponseDueAt.getTime() - base.getTime()).toBe(24 * H);
    expect(d.dueAt.getTime() - base.getTime()).toBe(7 * 24 * H);
  });

  it("просрочка первой реакции", () => {
    const d = computeDeadlines(base, "HIGH");
    const s = slaInfo({ status: "NEW", firstResponseAt: null, ...d }, new Date(base.getTime() + 30 * H), base);
    expect(s.state).toBe("overdue");
    expect(s.firstResponseOverdue).toBe(true);
    expect(s.phase).toBe("first_response");
  });

  it("после реакции важен срок решения", () => {
    const d = computeDeadlines(base, "MEDIUM");
    const s = slaInfo({ status: "IN_PROGRESS", firstResponseAt: new Date(base.getTime() + H), ...d }, new Date(base.getTime() + 5 * 24 * H), base);
    expect(s.phase).toBe("resolution");
    expect(s.state).toBe("ok");
  });

  it("«скоро» — меньше 25% окна", () => {
    const d = computeDeadlines(base, "MEDIUM"); // 48 ч на реакцию
    const s = slaInfo({ status: "NEW", firstResponseAt: null, ...d }, new Date(base.getTime() + 40 * H), base);
    expect(s.state).toBe("soon");
  });

  it("ожидание автора — пауза, закрытые — без SLA", () => {
    const d = computeDeadlines(base, "LOW");
    expect(slaInfo({ status: "NEEDS_INFO", firstResponseAt: base, ...d }, new Date(base.getTime() + H), base).state).toBe("paused");
    expect(slaInfo({ status: "IMPLEMENTED", firstResponseAt: base, ...d }, new Date(base.getTime() + 999 * H), base).state).toBe("done");
  });

  it("форматирует длительности", () => {
    expect(formatDuration(26 * H)).toBe("1 д 2 ч");
    expect(formatDuration(-5 * H)).toBe("5 ч");
    expect(formatDuration(10 * 60_000)).toBe("10 мин");
  });
});
