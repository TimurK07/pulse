import { describe, expect, it } from "vitest";
import { dueFromLocalDate, timeToResult, timeToResultLabel } from "@/lib/client/format";

describe("срок решения из поля даты", () => {
  it("18:00 выбранного дня, если это время ещё не наступило", () => {
    const now = new Date("2026-11-12T10:00:00");
    expect(dueFromLocalDate("2026-11-12", now)).toBe(new Date("2026-11-12T18:00:00").toISOString());
    expect(dueFromLocalDate("2026-11-20", now)).toBe(new Date("2026-11-20T18:00:00").toISOString());
  });
  it("вечером сегодняшняя дата даёт конец дня, а не срок в прошлом", () => {
    expect(dueFromLocalDate("2026-11-12", new Date("2026-11-12T19:30:00"))).toBe(new Date("2026-11-12T23:59:00").toISOString());
  });
  it("прошедший день и неполная дата не сохраняются", () => {
    const now = new Date("2026-11-12T10:00:00");
    expect(dueFromLocalDate("2026-11-11", now)).toBeNull();
    expect(dueFromLocalDate("0002-11-12", now)).toBeNull();
    expect(dueFromLocalDate("2026-11", now)).toBeNull();
  });
});

describe("время от подачи до результата", () => {
  it("одинаковая подпись для доски результатов и аналитики", () => {
    const created = "2026-11-12T07:04:00.000Z";
    expect(timeToResult(created, "2026-11-12T07:08:00.000Z")).toBe("меньше чем за сутки");
    expect(timeToResultLabel(0)).toBe("меньше чем за сутки");
    expect(timeToResult(created, "2026-11-13T09:00:00.000Z")).toBe("за 1 день");
    expect(timeToResultLabel(3)).toBe("за 3 дня");
    expect(timeToResultLabel(18)).toBe("за 18 дней");
    expect(timeToResultLabel(21)).toBe("за 21 день");
  });
});
