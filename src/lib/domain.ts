// Доменные константы PULSE. Файл используется и на сервере, и в браузере —
// не импортируйте сюда серверный код.

export type Role = "EMPLOYEE" | "HANDLER" | "MANAGER" | "ADMIN";
export type IssueType = "PROBLEM" | "IDEA" | "PRAISE";
export type IssueStatus =
  | "NEW"
  | "IN_REVIEW"
  | "NEEDS_INFO"
  | "IN_PROGRESS"
  | "IMPLEMENTED"
  | "REJECTED"
  | "CLOSED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type CommentKind = "COMMENT" | "INTERNAL" | "INFO_REQUEST" | "INFO_RESPONSE";

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Сотрудник",
  HANDLER: "Ответственный",
  MANAGER: "Руководитель",
  ADMIN: "Администратор",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  EMPLOYEE: "Подаёт обращения, отслеживает статус, отвечает на уточнения",
  HANDLER: "Рассматривает обращения своих категорий и фиксирует решения",
  MANAGER: "Видит все обращения, назначает, контролирует сроки и аналитику",
  ADMIN: "Настраивает категории, маршрутизацию, сроки, роли и AI",
};

export const TYPE_LABEL: Record<IssueType, string> = {
  PROBLEM: "Проблема",
  IDEA: "Предложение",
  PRAISE: "Положительный отзыв",
};

export const TYPE_HINT: Record<IssueType, string> = {
  PROBLEM: "Что-то мешает работать или работает не так",
  IDEA: "Как сделать процесс лучше",
  PRAISE: "Что стоит сохранить и развивать",
};

export const STATUS_LABEL: Record<IssueStatus, string> = {
  NEW: "Новое",
  IN_REVIEW: "На рассмотрении",
  NEEDS_INFO: "Ожидает уточнения",
  IN_PROGRESS: "В работе",
  IMPLEMENTED: "Реализовано",
  REJECTED: "Отклонено",
  CLOSED: "Закрыто",
};

export const STATUS_ORDER: IssueStatus[] = [
  "NEW",
  "IN_REVIEW",
  "NEEDS_INFO",
  "IN_PROGRESS",
  "IMPLEMENTED",
  "REJECTED",
  "CLOSED",
];

export const OPEN_STATUSES: IssueStatus[] = ["NEW", "IN_REVIEW", "NEEDS_INFO", "IN_PROGRESS"];
export const RESOLVED_STATUSES: IssueStatus[] = ["IMPLEMENTED", "REJECTED", "CLOSED"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
};
export const PRIORITY_ORDER: Priority[] = ["HIGH", "MEDIUM", "LOW"];

export function isOpen(status: IssueStatus) {
  return OPEN_STATUSES.includes(status);
}

/**
 * Допустимые переходы статусов. Переходы в финальные статусы требуют
 * текста решения (см. STATUS_REQUIRES_TEXT).
 */
export const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  NEW: ["IN_REVIEW", "IN_PROGRESS", "NEEDS_INFO", "REJECTED", "CLOSED"],
  IN_REVIEW: ["IN_PROGRESS", "NEEDS_INFO", "IMPLEMENTED", "REJECTED", "CLOSED"],
  NEEDS_INFO: ["IN_REVIEW", "IN_PROGRESS", "REJECTED", "CLOSED"],
  IN_PROGRESS: ["IMPLEMENTED", "NEEDS_INFO", "IN_REVIEW", "REJECTED"],
  IMPLEMENTED: ["IN_PROGRESS"],
  REJECTED: ["IN_REVIEW"],
  CLOSED: ["IN_REVIEW"],
};

/** «Закрыть с итогом» без решения по существу — для отзывов и неактуальных обращений */
export function allowedTransitions(status: IssueStatus, type: IssueType): IssueStatus[] {
  return TRANSITIONS[status].filter((s) => s !== "CLOSED" || type === "PRAISE" || status === "NEEDS_INFO" || status === "IN_REVIEW");
}

/** Что обязательно написать при переходе в статус */
export const STATUS_REQUIRES_TEXT: Partial<Record<IssueStatus, { label: string; placeholder: string; min: number }>> = {
  NEEDS_INFO: {
    label: "Вопрос автору",
    placeholder: "Что нужно уточнить? Автор получит уведомление и ответит в карточке обращения.",
    min: 10,
  },
  IMPLEMENTED: {
    label: "Что сделано",
    placeholder: "Опишите результат: что изменилось и где это увидеть. Текст увидит автор.",
    min: 20,
  },
  REJECTED: {
    label: "Мотивированный отказ",
    placeholder: "Объясните причину отказа и при каких условиях к вопросу можно вернуться.",
    min: 30,
  },
  CLOSED: {
    label: "Итог",
    placeholder: "Коротко зафиксируйте итог: например, отзыв передан команде.",
    min: 10,
  },
};

/** Действие при переходе — текст на кнопке */
export const TRANSITION_ACTION: Record<IssueStatus, string> = {
  NEW: "Вернуть в новые",
  IN_REVIEW: "Взять на рассмотрение",
  NEEDS_INFO: "Запросить уточнение",
  IN_PROGRESS: "Принять в работу",
  IMPLEMENTED: "Отметить реализованным",
  REJECTED: "Отклонить с объяснением",
  CLOSED: "Закрыть с итогом",
};

/** Подпись действия с учётом направления (возврат назад называется иначе) */
export function transitionLabel(from: IssueStatus, to: IssueStatus) {
  if (to === "IN_REVIEW" && from === "IN_PROGRESS") return "Вернуть на рассмотрение";
  if (to === "IN_REVIEW" && from === "NEEDS_INFO") return "Продолжить без ответа";
  if (to === "IN_REVIEW" && (from === "REJECTED" || from === "CLOSED")) return "Переоткрыть";
  if (to === "IN_PROGRESS" && from === "IMPLEMENTED") return "Вернуть в работу";
  return TRANSITION_ACTION[to];
}

/** Шаги прогресса для автора */
export const AUTHOR_STEPS = [
  { key: "received", label: "Принято" },
  { key: "review", label: "Рассмотрение" },
  { key: "work", label: "В работе" },
  { key: "result", label: "Результат" },
] as const;

export function authorStepIndex(status: IssueStatus): number {
  switch (status) {
    case "NEW":
      return 0;
    case "IN_REVIEW":
    case "NEEDS_INFO":
      return 1;
    case "IN_PROGRESS":
      return 2;
    default:
      return 3;
  }
}

export const DEFAULT_SLA: Record<Priority, { firstResponseHours: number; resolutionDays: number }> = {
  HIGH: { firstResponseHours: 24, resolutionDays: 7 },
  MEDIUM: { firstResponseHours: 48, resolutionDays: 14 },
  LOW: { firstResponseHours: 72, resolutionDays: 21 },
};

export const LIMITS = {
  titleMin: 5,
  titleMax: 140,
  descriptionMin: 20,
  descriptionMax: 5000,
  solutionMax: 3000,
  commentMax: 4000,
  attachmentMaxBytes: 10 * 1024 * 1024,
  attachmentsPerIssue: 5,
} as const;

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WEBP",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/msword": "DOC",
  "application/vnd.ms-excel": "XLS",
};

export function formatCode(n: number) {
  return `A-${String(n).padStart(3, "0")}`;
}

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
