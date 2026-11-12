import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export const fmtDate = (iso: string) => format(new Date(iso), "d MMM yyyy", { locale: ru });
export const fmtDateTime = (iso: string) => format(new Date(iso), "d MMM, HH:mm", { locale: ru });
export const fmtShort = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm", { locale: ru });
  if (isYesterday(d)) return `вчера, ${format(d, "HH:mm", { locale: ru })}`;
  return format(d, "d MMM", { locale: ru });
};
export const fmtAgo = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: ru, addSuffix: true });
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const fmtHours = (h: number | null | undefined) => {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0).replace(".", ",")} ч`;
  return `${(h / 24).toFixed(1).replace(".", ",")} д`;
};
export const fmtBytes = (n: number) => (n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`);
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/**
 * Срок решения из даты в поле «изменить» (YYYY-MM-DD, местное время): 18:00 выбранного дня,
 * а если сегодня 18:00 уже прошло — конец дня. null, если и конец дня уже в прошлом.
 */
export function dueFromLocalDate(v: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  for (const t of ["18:00:00", "23:59:00"]) {
    const d = new Date(`${v}T${t}`);
    if (!Number.isNaN(d.getTime()) && d > now) return d.toISOString();
  }
  return null;
}

/** «за 3 дня», «меньше чем за сутки» — одинаково на доске результатов и в аналитике */
export function timeToResultLabel(days: number) {
  if (days < 1) return "меньше чем за сутки";
  const m10 = days % 10;
  const m100 = days % 100;
  const word = m10 === 1 && m100 !== 11 ? "день" : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? "дня" : "дней";
  return `за ${days} ${word}`;
}

export function timeToResult(createdAt: string | Date, resolvedAt: string | Date) {
  return timeToResultLabel(Math.round((new Date(resolvedAt).getTime() - new Date(createdAt).getTime()) / 864e5));
}
