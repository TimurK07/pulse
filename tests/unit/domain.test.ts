import { describe, expect, it } from "vitest";
import { STATUS_REQUIRES_TEXT, allowedTransitions, transitionLabel } from "@/lib/domain";

describe("жизненный цикл обращения", () => {
  it("отказ и реализация требуют обоснования", () => {
    expect(STATUS_REQUIRES_TEXT.REJECTED?.min).toBeGreaterThanOrEqual(30);
    expect(STATUS_REQUIRES_TEXT.IMPLEMENTED?.min).toBeGreaterThan(0);
    expect(STATUS_REQUIRES_TEXT.NEEDS_INFO?.min).toBeGreaterThan(0);
  });
  it("из нового нельзя сразу «реализовано»", () => {
    expect(allowedTransitions("NEW", "PROBLEM")).not.toContain("IMPLEMENTED");
  });
  it("«закрыть» без решения по существу — только для отзывов или после рассмотрения", () => {
    expect(allowedTransitions("NEW", "PROBLEM")).not.toContain("CLOSED");
    expect(allowedTransitions("NEW", "PRAISE")).toContain("CLOSED");
    expect(allowedTransitions("IN_REVIEW", "IDEA")).toContain("CLOSED");
  });
  it("первое действие — следующий логичный шаг", () => {
    expect(allowedTransitions("IN_PROGRESS", "PROBLEM")[0]).toBe("IMPLEMENTED");
    expect(transitionLabel("IN_PROGRESS", "IN_REVIEW")).toBe("Вернуть на рассмотрение");
    expect(transitionLabel("REJECTED", "IN_REVIEW")).toBe("Переоткрыть");
  });
});
