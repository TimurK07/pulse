// Схемы валидации входных данных (используются сервером; клиент повторяет ограничения в формах)
import { z } from "zod";
import { LIMITS } from "./domain";

// Сообщения валидации по умолчанию — на русском
z.config(z.locales.ru());

// PostgreSQL не принимает символ 0x00 в тексте: без очистки запрос падал бы с 500
const noNul = (s: string) => s.replace(/\u0000/g, "");
const CODE_RE = /^[A-Z]-\d{3,}$/;

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label}: обязательное поле` })
    .transform((s) => noNul(s).trim())
    .pipe(
      z
        .string()
        .min(min, `${label}: минимум ${min} символов`)
        .max(max, `${label}: максимум ${max} символов`),
    );

export const issueTypeSchema = z.enum(["PROBLEM", "IDEA", "PRAISE"]);
export const statusSchema = z.enum(["NEW", "IN_REVIEW", "NEEDS_INFO", "IN_PROGRESS", "IMPLEMENTED", "REJECTED", "CLOSED"]);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createIssueSchema = z.object({
  type: issueTypeSchema,
  categoryId: z.string().min(1, "Выберите категорию"),
  title: trimmed(LIMITS.titleMin, LIMITS.titleMax, "Заголовок"),
  description: trimmed(LIMITS.descriptionMin, LIMITS.descriptionMax, "Описание"),
  proposedSolution: z
    .string()
    .max(LIMITS.solutionMax)
    .optional()
    .transform((s) => (s && noNul(s).trim() ? noNul(s).trim() : undefined)),
  isAnonymous: z.boolean().default(false),
  isPrivate: z.boolean().default(false),
  /** код обращения, которое автор видел как похожее, но решил подать своё */
  acknowledgedSimilar: z.array(z.string().regex(CODE_RE, "Некорректный код обращения")).max(10).optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z
  .object({
    status: statusSchema.optional(),
    /** текст, обязательный для некоторых переходов (вопрос, решение, отказ) */
    text: z.string().max(LIMITS.commentMax).transform(noNul).optional(),
    priority: prioritySchema.optional(),
    assigneeId: z.string().nullable().optional(),
    categoryId: z.string().optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Нет изменений");

export const commentSchema = z.object({
  body: trimmed(1, LIMITS.commentMax, "Комментарий"),
  kind: z.enum(["COMMENT", "INTERNAL"]).default("COMMENT"),
});

export const listQuerySchema = z.object({
  view: z
    .enum(["mine", "supported", "queue", "attention", "no_response", "overdue", "needs_info", "open", "resolved", "all"])
    .default("open"),
  status: z.array(statusSchema).optional(),
  type: issueTypeSchema.optional(),
  categoryId: z.string().optional(),
  departmentId: z.string().optional(),
  assignee: z.string().optional(), // id | "me" | "none"
  priority: prioritySchema.optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(["created_desc", "created_asc", "deadline", "priority", "supporters"]).default("created_desc"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** точный набор обращений по кодам (диалог системного решения) */
  codes: z.array(z.string().regex(CODE_RE)).max(50).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const aiTextSchema = z.object({
  title: z.string().max(LIMITS.titleMax).transform(noNul).optional().default(""),
  description: z.string().max(LIMITS.descriptionMax).transform(noNul).default(""),
  type: issueTypeSchema.optional(),
});

export const themeDecisionSchema = z.object({
  title: trimmed(3, 160, "Название темы"),
  codes: z.array(z.string().regex(CODE_RE, "Некорректный код обращения")).min(1, "Выберите хотя бы одно обращение").max(30),
  status: z.enum(["IN_PROGRESS", "IMPLEMENTED", "REJECTED"]),
  text: z.string().max(LIMITS.commentMax).transform(noNul),
  ownerId: z.string().nullable().optional(),
});

/** Норматив сроков по приоритету (админка): реакция не может быть дольше решения */
export const slaPolicySchema = z
  .object({
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    firstResponseHours: z.number().int().min(1).max(24 * 30),
    resolutionDays: z.number().int().min(1).max(365),
  })
  .refine((s) => s.firstResponseHours <= s.resolutionDays * 24, {
    message: "Срок первой реакции не может быть дольше срока решения",
    path: ["firstResponseHours"],
  });
