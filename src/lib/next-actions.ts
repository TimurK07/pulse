// «Что сделать сейчас» на Пульсе руководителя: детерминированные правила по данным.
// Без AI и без побочных эффектов — только подсказки со ссылками.
import type { IssueListItem } from "@/lib/services/issues";
import type { Analytics } from "@/lib/services/analytics";
import { formatDuration, type SlaInfo } from "@/lib/sla";
import { pluralRu } from "@/lib/domain";

export type WithSla = { i: IssueListItem; s: SlaInfo };

export interface Act {
  key: string;
  tone: "danger" | "warn" | "neutral";
  title: string;
  detail: string;
  href: string;
  cta: string;
}

/** Конкретные шаги для руководителя — детерминированные правила по данным, без AI */
export function buildActions(
  data: { overdue: WithSla[]; unassigned: IssueListItem[]; waiting: WithSla[] },
  a?: Pick<Analytics, "byAssignee" | "themes">,
  now: number = Date.now(),
): Act[] {
  const out: Act[] = [];
  for (const x of data.overdue.slice(0, 2)) {
    out.push({
      key: `od-${x.i.code}`,
      tone: "danger",
      title: `${x.i.code}: ${x.s.phase === "first_response" ? "нет первой реакции" : "просрочено решение"}`,
      detail: `просрочено на ${formatDuration(x.s.msLeft ?? 0)} · ${x.i.assignee?.name ?? "без ответственного"}`,
      href: `/issues/${x.i.code}`,
      cta: "Открыть",
    });
  }
  for (const i of data.unassigned.slice(0, 1)) {
    out.push({ key: `un-${i.code}`, tone: "danger", title: `Назначить ответственного: ${i.code}`, detail: i.title, href: `/issues/${i.code}`, cta: "Назначить" });
  }
  const overloaded = (a?.byAssignee ?? []).filter((r) => r.overdue >= 1 && r.open >= 2).sort((x, y) => y.overdue - x.overdue)[0];
  if (overloaded) {
    out.push({
      key: `ld-${overloaded.id}`,
      tone: "warn",
      title: `Перераспределить нагрузку: ${overloaded.name}`,
      detail: `${overloaded.open} открытых, ${overloaded.overdue} ${pluralRu(overloaded.overdue, "просрочено", "просрочено", "просрочено")}`,
      href: `/queue?view=open&assignee=${overloaded.id}`,
      cta: "Очередь",
    });
  }
  const longWait = data.waiting.filter((x) => now - new Date(x.i.updatedAt).getTime() > 3 * 864e5)[0];
  if (longWait) {
    const days = Math.floor((now - new Date(longWait.i.updatedAt).getTime()) / 864e5);
    out.push({ key: `wt-${longWait.i.code}`, tone: "neutral", title: `Автор ${longWait.i.code} не отвечает ${days} ${pluralRu(days, "день", "дня", "дней")}`, detail: "Напомните или продолжите без ответа", href: `/issues/${longWait.i.code}`, cta: "Открыть" });
  }
  const theme = (a?.themes ?? []).find((th) => th.openCount >= 2);
  if (theme) {
    out.push({
      key: `th-${theme.key}`,
      tone: "neutral",
      title: `Назначить владельца темы «${theme.title}»`,
      detail: `${theme.codes.length} обращений, ${theme.supporters} поддержек — одно системное решение`,
      href: "/analytics",
      cta: "Тема",
    });
  }
  return out.slice(0, 5);
}

