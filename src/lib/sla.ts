// Расчёт сроков и состояния SLA. Чистые функции — покрыты unit-тестами.
import { DEFAULT_SLA, isOpen, type IssueStatus, type Priority } from "./domain";

export type SlaPolicyMap = Record<Priority, { firstResponseHours: number; resolutionDays: number }>;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function computeDeadlines(createdAt: Date, priority: Priority, policy: SlaPolicyMap = DEFAULT_SLA) {
  const p = policy[priority];
  return {
    firstResponseDueAt: new Date(createdAt.getTime() + p.firstResponseHours * HOUR),
    dueAt: new Date(createdAt.getTime() + p.resolutionDays * DAY),
  };
}

export type SlaState = "ok" | "soon" | "overdue" | "done" | "paused";

export interface SlaInfo {
  /** Ключевое состояние для отображения */
  state: SlaState;
  /** Какой срок сейчас важен */
  phase: "first_response" | "resolution" | "none";
  /** Срок в мс от now (отрицательный — просрочено) */
  msLeft: number | null;
  deadline: Date | null;
  firstResponseOverdue: boolean;
  resolutionOverdue: boolean;
}

interface SlaInput {
  status: IssueStatus;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date;
  dueAt: Date;
  /** начало паузы (ожидание ответа автора): срок решения в это время не идёт */
  pausedAt?: Date | null;
}

/** «Скоро» — осталось меньше 25% окна или меньше 12 часов */
function soonThreshold(windowMs: number) {
  return Math.min(windowMs * 0.25, 12 * HOUR);
}

export function slaInfo(issue: SlaInput, now: Date = new Date(), createdAt?: Date): SlaInfo {
  if (!isOpen(issue.status)) {
    return {
      state: "done",
      phase: "none",
      msLeft: null,
      deadline: null,
      firstResponseOverdue: false,
      resolutionOverdue: false,
    };
  }
  const paused = issue.status === "NEEDS_INFO";
  // на паузе остаток срока «заморожен» на момент запроса уточнения
  const clock = paused ? (issue.pausedAt ?? now) : now;
  const resolutionOverdue = issue.dueAt.getTime() < clock.getTime();
  const firstResponseOverdue = !issue.firstResponseAt && issue.firstResponseDueAt.getTime() < now.getTime();

  const phase: SlaInfo["phase"] = issue.firstResponseAt ? "resolution" : "first_response";
  const deadline = phase === "first_response" ? issue.firstResponseDueAt : issue.dueAt;
  const msLeft = deadline.getTime() - (phase === "resolution" ? clock : now).getTime();
  const windowMs = createdAt ? deadline.getTime() - createdAt.getTime() : 2 * DAY;

  let state: SlaState = "ok";
  // на паузе просрочкой считается только пропущенная первая реакция — так же, как в списках и эскалациях
  if (firstResponseOverdue || (resolutionOverdue && !paused)) state = "overdue";
  else if (paused) state = "paused";
  else if (msLeft < soonThreshold(windowMs)) state = "soon";

  return { state, phase, msLeft, deadline, firstResponseOverdue, resolutionOverdue };
}

/** «2 д 4 ч», «5 ч», «35 мин» */
export function formatDuration(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.floor((abs % HOUR) / 60000);
  if (d > 0) return h > 0 ? `${d} д ${h} ч` : `${d} д`;
  if (h > 0) return `${h} ч`;
  return `${Math.max(m, 1)} мин`;
}

export function slaLabel(info: SlaInfo) {
  if (info.state === "done" || info.msLeft === null) return "";
  const what = info.phase === "first_response" ? "реакция" : "решение";
  if (info.msLeft < 0) return `${what}: просрочено на ${formatDuration(info.msLeft)}`;
  return `${what}: ${formatDuration(info.msLeft)}`;
}

/** Перенос срока решения на время паузы: вызывается при выходе из «Ожидает уточнения» */
export function resumeAfterPause(dueAt: Date, pausedAt: Date | null, now: Date) {
  if (!pausedAt) return dueAt;
  const paused = Math.max(0, now.getTime() - pausedAt.getTime());
  return new Date(dueAt.getTime() + paused);
}

/**
 * Просрочено ли открытое обращение. Срок решения не считается просроченным,
 * пока обращение ждёт ответа автора (пауза) — так же, как в списках и эскалациях.
 */
export function isOverdue(
  i: { status: IssueStatus; dueAt: Date; firstResponseAt: Date | null; firstResponseDueAt: Date },
  now: Date = new Date(),
) {
  if (!isOpen(i.status)) return false;
  if (!i.firstResponseAt && i.firstResponseDueAt < now) return true;
  return i.status !== "NEEDS_INFO" && i.dueAt < now;
}
