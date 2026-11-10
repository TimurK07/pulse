// Матрица прав PULSE. Чистые функции: вызываются в каждом серверном обработчике.
// Документация: docs/ARCHITECTURE.md → «Права доступа».
import type { IssueStatus, Role } from "./domain";

export interface Actor {
  id: string;
  role: Role;
  departmentId: string | null;
}

export interface IssueAccessInput {
  authorId: string;
  assigneeId: string | null;
  categoryId: string;
  departmentId: string | null;
  isPrivate: boolean;
  isAnonymous: boolean;
  status: IssueStatus;
}

export interface AccessContext {
  /** категории, где пользователь — основной или резервный ответственный */
  handledCategoryIds: string[];
  /** подразделение, которым руководит пользователь */
  headOfDepartmentId: string | null;
  /** пользователь поддержал обращение */
  isSupporter?: boolean;
}

export const isStaff = (role: Role) => role === "HANDLER" || role === "MANAGER" || role === "ADMIN";
export const isManagerial = (role: Role) => role === "MANAGER" || role === "ADMIN";

/** Уровень доступа к обращению */
export type IssueAccess =
  | "none"
  | "public" // коллега: заголовок, описание, статус, итог; без автора и переписки
  | "author" // автор: всё, кроме внутренних заметок и событий
  | "handler"; // обработчик: всё, кроме личности анонимного автора

export function issueAccess(actor: Actor, issue: IssueAccessInput, ctx: AccessContext): IssueAccess {
  if (isManagerial(actor.role)) return "handler";
  if (actor.role === "HANDLER") {
    if (issue.assigneeId === actor.id) return "handler";
    if (ctx.handledCategoryIds.includes(issue.categoryId)) return "handler";
    // руководитель подразделения видит обращения своей команды, кроме анонимных
    if (ctx.headOfDepartmentId && issue.departmentId === ctx.headOfDepartmentId && !issue.isAnonymous) return "handler";
  }
  if (issue.authorId === actor.id) return "author";
  if (!issue.isPrivate && ctx.isSupporter) return "public";
  return "none";
}

export const canProcess = (access: IssueAccess) => access === "handler";

/** Переназначать может руководитель/админ; ответственный — только «забрать себе» */
export function canReassign(actor: Actor, access: IssueAccess, targetUserId: string | null) {
  if (access !== "handler") return false;
  if (isManagerial(actor.role)) return true;
  return targetUserId === actor.id;
}

export const canSeeAnalytics = (role: Role) => isStaff(role);
export const canAdminister = (role: Role) => role === "ADMIN";
export const canGenerateDigest = (role: Role) => isManagerial(role);

/** Автор отображается обработчику, только если обращение не анонимное */
export function authorVisible(access: IssueAccess, isAnonymous: boolean, actorIsAuthor: boolean) {
  if (actorIsAuthor) return true;
  if (access === "public") return false;
  return !isAnonymous;
}
