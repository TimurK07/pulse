import "server-only";
// Локальные (детерминированные) алгоритмы — fallback, когда Claude недоступен,
// и основа, на которую опирается AI (кандидаты похожих, кластеры тем).
import type { IssueStatus, IssueType, Priority } from "@/lib/domain";
import { CONCEPTS, TfIdfIndex, clusterDocs, enrich, firstSentences, primaryConcept, stem, tokenize } from "@/lib/text";

export interface CategoryRef {
  id: string;
  name: string;
  description: string;
  keywords: string[];
}

export interface CorpusIssue {
  id: string;
  code: string;
  type: IssueType;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  categoryName: string;
  departmentName: string | null;
  supportersCount: number;
  decision: string | null;
  createdAt: Date;
}

const IDEA_MARKERS = ["предлага", "можно", "было бы", "полезно", "стоит", "хорошо бы", "давайте", "идея"];
const PRAISE_MARKERS = ["спасибо", "благодар", "отметить", "понравил", "польза", "сохранить этот формат", "отлично", "помогло"];
const HIGH_MARKERS = ["срочн", "блокир", "не можем", "теряем", "потер", "клиент", "штраф", "авари", "безопасн", "срыв", "много времени"];

export function localClassify(input: { title: string; description: string; type?: IssueType }, categories: CategoryRef[]) {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const tokens = new Set(tokenize(text));

  const scored = categories
    .map((c) => {
      const hits = c.keywords.filter((k) => {
        const s = stem(k);
        return [...tokens].some((t) => t.startsWith(s) || s.startsWith(t));
      });
      const nameHits = tokenize(c.name).filter((t) => tokens.has(t)).length;
      return { c, score: hits.length + nameHits * 1.5, hits };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const praise = PRAISE_MARKERS.filter((m) => text.includes(m)).length;
  const idea = IDEA_MARKERS.filter((m) => text.includes(m)).length;
  const type: IssueType = input.type ?? (praise >= 2 ? "PRAISE" : idea >= 1 ? "IDEA" : "PROBLEM");
  const high = HIGH_MARKERS.some((m) => text.includes(m));
  const priority: Priority = type === "PRAISE" ? "LOW" : high ? "HIGH" : type === "IDEA" ? "LOW" : "MEDIUM";

  return {
    type,
    categoryId: best && best.score > 0 ? best.c.id : null,
    category: best && best.score > 0 ? best.c.name : null,
    priority,
    suggestedTitle: input.title.trim() || firstSentences(input.description, 90).replace(/[.!?]$/, ""),
    summary: firstSentences(input.description, 200),
    reasoning:
      best && best.score > 0
        ? `Совпадения с ключевыми словами категории: ${best.hits.slice(0, 4).join(", ") || best.c.name}`
        : "Не удалось уверенно определить категорию по ключевым словам — выберите вручную",
    confidence: (best && best.score >= 3 ? "medium" : "low") as "high" | "medium" | "low",
  };
}

export function buildIndex(corpus: CorpusIssue[]) {
  return new TfIdfIndex(corpus.map((i) => ({ id: i.id, text: enrich(`${i.title}. ${i.title}. ${i.description}`) })));
}

export function localSimilar(text: string, corpus: CorpusIssue[], excludeId?: string, limit = 5) {
  if (!corpus.length || text.trim().length < 10) return [];
  const index = buildIndex(corpus);
  const byId = new Map(corpus.map((c) => [c.id, c]));
  return index
    .query(enrich(text), limit, excludeId ? new Set([excludeId]) : undefined)
    .filter((r) => r.score >= 0.12)
    .map((r) => ({
      issue: byId.get(r.id)!,
      score: r.score,
      relation: (r.score >= 0.4 ? "duplicate" : "related") as "duplicate" | "related",
      reason: r.score >= 0.4 ? "Очень близкие формулировки" : sharedReason(r.shared),
    }));
}

function sharedReason(shared: string[]) {
  const concepts = shared.filter((s) => /^zzc\d$/.test(s)).map((s) => CONCEPTS[Number(s.slice(3))]?.label.toLowerCase());
  const words = shared.filter((s) => !/^zzc\d$/.test(s)).slice(0, 3);
  if (concepts.length) return `Общая тема: ${concepts[0]}`;
  return words.length ? `Общие слова: ${words.join(", ")}…` : "Близкие формулировки";
}

export interface Theme {
  key: string;
  title: string;
  issueIds: string[];
  codes: string[];
  categories: string[];
  departments: string[];
  openCount: number;
  supporters: number;
}

/**
 * Повторяющиеся проблемы. Гибридный детерминированный алгоритм:
 * 1) обращения группируются по основному понятию доменного словаря
 *    («прозрачность статусов», «актуальность версий» и т. д.);
 * 2) обращения без явного понятия кластеризуются по сходству TF-IDF.
 * Тема — минимум 2 обращения. AI-сводка затем уточняет формулировки.
 */
export function localThemes(corpus: CorpusIssue[], threshold = 0.3): Theme[] {
  const candidates = corpus.filter((c) => c.type !== "PRAISE");
  if (candidates.length < 2) return [];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const groups: { ids: string[]; concept?: string }[] = [];
  const rest: string[] = [];
  const byConcept = new Map<string, string[]>();
  for (const c of candidates) {
    const k = primaryConcept(`${c.title} ${c.description}`);
    if (k) byConcept.set(k, [...(byConcept.get(k) ?? []), c.id]);
    else rest.push(c.id);
  }
  for (const [k, ids] of byConcept) {
    if (ids.length >= 2) groups.push({ ids, concept: k });
    else rest.push(...ids);
  }
  if (rest.length >= 2) {
    const index = buildIndex(rest.map((id) => byId.get(id)!));
    for (const ids of clusterDocs(index, rest, threshold, 2)) groups.push({ ids });
  }
  return groups
    .map(({ ids, concept }) => {
      const issues = ids.map((id) => byId.get(id)!);
      const lead = [...issues].sort((a, b) => b.supportersCount - a.supportersCount || a.createdAt.getTime() - b.createdAt.getTime())[0];
      const label = concept ? CONCEPTS.find((c) => c.key === concept)?.label : undefined;
      return {
        key: concept ?? ids.slice().sort().join("|"),
        title: label ?? lead.title,
        issueIds: ids,
        codes: issues.map((i) => i.code).sort(),
        categories: [...new Set(issues.map((i) => i.categoryName))],
        departments: [...new Set(issues.map((i) => i.departmentName).filter((x): x is string => !!x))],
        openCount: issues.filter((i) => ["NEW", "IN_REVIEW", "NEEDS_INFO", "IN_PROGRESS"].includes(i.status)).length,
        supporters: issues.reduce((s, i) => s + i.supportersCount, 0),
      };
    })
    .sort((a, b) => b.codes.length + b.supporters / 10 - (a.codes.length + a.supporters / 10));
}

export function localTriage(issue: { title: string; description: string; proposedSolution: string | null; status: IssueStatus; type: IssueType; priority: Priority }) {
  const cls = localClassify({ title: issue.title, description: issue.description, type: issue.type }, []);
  const nextStep: Record<IssueStatus, string> = {
    NEW: "Подтвердить получение автору и взять обращение на рассмотрение",
    IN_REVIEW: "Оценить реализуемость и принять решение: в работу, уточнение или мотивированный отказ",
    NEEDS_INFO: "Дождаться ответа автора на уточняющий вопрос",
    IN_PROGRESS: "Зафиксировать промежуточный результат и срок внедрения",
    IMPLEMENTED: "Сообщить сотрудникам о результате на доске изменений",
    REJECTED: "Решение принято — действий не требуется",
    CLOSED: "Обращение закрыто — действий не требуется",
  };
  return {
    summary: firstSentences(issue.description, 240),
    keyPoints: [] as string[],
    suggestedNextStep: nextStep[issue.status],
    suggestedPriority: cls.priority,
    priorityReason: cls.priority === "HIGH" ? "В тексте есть признаки срочности или влияния на клиентов" : "Явных признаков срочности не найдено",
    clarifyingQuestion: issue.proposedSolution
      ? null
      : issue.type === "PRAISE"
        ? null
        : "Можете привести конкретный пример ситуации и оценить, как часто она повторяется?",
  };
}

export interface DigestContent {
  headline: string;
  overview: string;
  systemicProblems: {
    title: string;
    description: string;
    issueCodes: string[];
    impact: "high" | "medium" | "low";
    recommendation: string;
  }[];
  quickWins: { title: string; issueCodes: string[]; why: string }[];
  risks: string[];
  positiveSignals: string[];
}

export function localDigest(corpus: CorpusIssue[], stats: { total: number; open: number; overdue: number; implemented: number }): DigestContent {
  const themes = localThemes(corpus);
  const praise = corpus.filter((c) => c.type === "PRAISE");
  const implemented = corpus.filter((c) => c.status === "IMPLEMENTED");
  const quick = corpus
    .filter((c) => c.type === "IDEA" && ["NEW", "IN_REVIEW"].includes(c.status) && c.priority !== "HIGH")
    .sort((a, b) => b.supportersCount - a.supportersCount)
    .slice(0, 3);
  return {
    headline: themes.length
      ? `Выявлено ${themes.length} повторяющихся тем; крупнейшая — «${themes[0].title}»`
      : "Повторяющихся тем не выявлено",
    overview: `Всего обращений: ${stats.total}, открыто: ${stats.open}, просрочено: ${stats.overdue}, реализовано улучшений: ${stats.implemented}. Темы определены автоматически по сходству формулировок (локальный алгоритм TF-IDF).`,
    systemicProblems: themes.slice(0, 5).map((t) => ({
      title: t.title,
      description: `${t.codes.length} обращения в категориях: ${t.categories.join(", ")}${t.departments.length ? `; подразделения: ${t.departments.join(", ")}` : ""}.`,
      issueCodes: t.codes,
      impact: (t.codes.length >= 3 || t.supporters >= 5 ? "high" : "medium") as "high" | "medium",
      recommendation: "Назначить владельца темы и рассмотреть обращения вместе, чтобы принять одно системное решение.",
    })),
    quickWins: quick.map((q) => ({ title: q.title, issueCodes: [q.code], why: "Предложение без высокой сложности, ожидает решения" })),
    risks: stats.overdue ? [`${stats.overdue} обращений с нарушенным сроком — риск потери доверия к каналу обратной связи`] : [],
    positiveSignals: [
      ...implemented.slice(0, 3).map((i) => `Реализовано: ${i.title}`),
      ...praise.slice(0, 2).map((p) => `Положительный отзыв: ${p.title}`),
    ],
  };
}
