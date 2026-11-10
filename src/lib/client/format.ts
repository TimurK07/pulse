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
