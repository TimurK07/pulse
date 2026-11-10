import { describe, expect, it } from "vitest";
import { TfIdfIndex, enrich, primaryConcept, redactPII, tokenize } from "@/lib/text";
import { localClassify, localThemes, type CorpusIssue } from "@/lib/ai/local";

const mk = (code: string, title: string, description: string, extra: Partial<CorpusIssue> = {}): CorpusIssue => ({
  id: code, code, title, description, type: "PROBLEM", status: "NEW", priority: "MEDIUM", categoryName: "К", departmentName: "Отдел",
  supportersCount: 0, decision: null, createdAt: new Date("2026-10-01"), ...extra,
});

describe("локальный текстовый движок", () => {
  it("токенизация убирает стоп-слова и приводит формы к основе", () => {
    const t = tokenize("Предлагаю добавить обязательные поля в заявках");
    expect(t).not.toContain("предлагаю");
    expect(tokenize("заявках")[0]).toBe(tokenize("заявки")[0]);
  });
  it("находит похожее обращение", () => {
    const idx = new TfIdfIndex([
      { id: "a", text: enrich("Не видно статус пакета документов и ответственного") },
      { id: "b", text: enrich("Зона для перерывов в офисе") },
    ]);
    expect(idx.query(enrich("Хотелось бы видеть текущий статус и этап документов"), 1)[0].id).toBe("a");
  });
  it("определяет основное понятие", () => {
    expect(primaryConcept("В общих папках трудно найти актуальную редакцию инструкции, нужны правила именования и архивирования версий")).toBe("actuality");
    expect(primaryConcept("Зона для перерывов")).toBeNull();
  });
  it("выделяет повторяющиеся темы", () => {
    const themes = localThemes([
      mk("A-1", "Не виден статус пакета", "Хотелось бы видеть этап и статус документов"),
      mk("A-2", "Статус проекта для поставщиков", "Показывать стадию проекта и контрольные даты, чтобы видеть статус"),
      mk("A-3", "Зона отдыха", "Небольшая зона для перерывов"),
    ]);
    expect(themes).toHaveLength(1);
    expect(themes[0].codes).toEqual(["A-1", "A-2"]);
    expect(themes[0].title).toBe("Прозрачность статусов и сроков");
  });
  it("локальный классификатор выбирает категорию по ключевым словам", () => {
    const r = localClassify({ title: "Повторный ввод в системы", description: "Одни и те же данные приходится вводить в разные системы, нужна синхронизация" }, [
      { id: "it", name: "Интеграции и IT", description: "", keywords: ["систем", "ввод", "синхрониз"] },
      { id: "of", name: "Корпоративная среда", description: "", keywords: ["офис", "зона"] },
    ]);
    expect(r.categoryId).toBe("it");
    expect(r.type).toBe("PROBLEM");
  });
  it("маскирует персональные данные перед отправкой в AI", () => {
    expect(redactPII("пишите ivan@corp.ru или +7 (912) 345-67-89")).toBe("пишите [email] или [телефон]");
  });
});
