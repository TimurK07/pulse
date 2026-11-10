"use client";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CircleDot,
  FileUp,
  Flag,
  GitBranch,
  HelpCircle,
  Lock,
  Send,
  Tag,
  ThumbsUp,
  UserRoundCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL, STATUS_LABEL, type IssueStatus, type Priority } from "@/lib/domain";
import type { IssueDetail } from "@/lib/services/issues";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { Avatar, STATUS_VAR, StatusIcon } from "@/components/ui/status";
import { Tip } from "@/components/ui/tooltip";

type Item = IssueDetail["timeline"][number];

const st = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as IssueStatus] : (v ?? "—"));

function eventText(e: Extract<Item, { kind: "event" }>): { icon: React.ReactNode; text: React.ReactNode; tone?: "danger" } {
  const who = e.actor?.name;
  switch (e.type) {
    case "CREATED":
      return { icon: <Send className="size-3.5" />, text: <>Обращение подано{who && <> · {who}</>}</> };
    case "ROUTED":
      return { icon: <GitBranch className="size-3.5" />, text: <>Маршрутизация: {e.note}</> };
    case "ASSIGNED":
      return {
        icon: <UserRoundCheck className="size-3.5" />,
        text: e.toValue ? (
          <>
            Ответственный: <b className="font-medium text-ink">{e.toValue}</b>
            {e.fromValue && <> (был {e.fromValue})</>}
            {who && <> · {who}</>}
          </>
        ) : (
          <>Ответственный снят{who && <> · {who}</>}</>
        ),
      };
    case "STATUS_CHANGED":
      return {
        icon: e.toValue ? <StatusIcon status={e.toValue as IssueStatus} size={14} /> : <CircleDot className="size-3.5" />,
        text: (
          <>
            {who && <>{who} · </>}
            {st(e.fromValue)} → <b className="font-medium text-ink">{st(e.toValue)}</b>
            {e.note && <> · {e.note}</>}
          </>
        ),
      };
    case "PRIORITY_CHANGED":
      return {
        icon: <Flag className="size-3.5" />,
        text: (
          <>
            Приоритет: {PRIORITY_LABEL[e.fromValue as Priority]} → <b className="font-medium text-ink">{PRIORITY_LABEL[e.toValue as Priority]}</b>
            {who && <> · {who}</>}
          </>
        ),
      };
    case "CATEGORY_CHANGED":
      return {
        icon: <Tag className="size-3.5" />,
        text: (
          <>
            Категория: {e.fromValue} → <b className="font-medium text-ink">{e.toValue}</b>
            {who && <> · {who}</>}
          </>
        ),
      };
    case "DUE_CHANGED":
      return {
        icon: <CalendarClock className="size-3.5" />,
        text: (
          <>
            Срок решения перенесён на <b className="font-medium text-ink">{e.toValue ? fmtDate(e.toValue) : "—"}</b>
            {who && <> · {who}</>}
          </>
        ),
      };
    case "ESCALATED":
      return { icon: <AlertTriangle className="size-3.5" />, text: <>Эскалация руководителю: {e.note?.toLowerCase()}</>, tone: "danger" };
    case "SUPPORTED":
      return { icon: <ThumbsUp className="size-3.5" />, text: <>{who ?? "Коллега"} поддерживает обращение</> };
    case "ATTACHMENT_ADDED":
      return { icon: <FileUp className="size-3.5" />, text: <>Добавлен файл «{e.toValue}»{who && <> · {who}</>}</> };
    default:
      return { icon: <ArrowRightLeft className="size-3.5" />, text: e.type };
  }
}

/** Порядок событий с одинаковым временем: подача → маршрут → назначение → остальное */
const TIE: Record<string, number> = { CREATED: 0, ROUTED: 1, ASSIGNED: 2 };
const tieRank = (it: Item) => (it.kind === "event" ? (TIE[it.type] ?? 5) : 6);

export function Timeline({ items: raw, highlightId }: { items: Item[]; highlightId?: string | null }) {
  if (!raw.length) return null;
  const items = [...raw].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || tieRank(a) - tieRank(b));
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-line" />
      {items.map((it) => {
        if (it.kind === "event" && it.type === "DECISION") {
          const status = it.toValue as IssueStatus;
          return (
            <li key={it.id} className="relative py-3 pl-9">
              <span className="absolute left-[4px] top-4 grid size-4 place-items-center bg-surface">
                <StatusIcon status={status} size={16} />
              </span>
              <div className="rounded-ctl bg-subtle px-4 py-3" style={{ boxShadow: `inset 2px 0 0 var(--st-${STATUS_VAR[status]})` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ui font-semibold" style={{ color: `var(--st-${STATUS_VAR[status]})` }}>
                    Решение: {STATUS_LABEL[status]}
                  </span>
                  <span className="text-micro text-ink-3">
                    {it.actor?.name} · {fmtDateTime(it.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-body text-ink">{it.note}</p>
              </div>
            </li>
          );
        }
        if (it.kind === "event") {
          const { icon, text, tone } = eventText(it);
          return (
            <li key={it.id} className="relative flex items-start gap-3 py-1.5 pl-9">
              <span className={cn("absolute left-[4px] top-[9px] grid size-4 place-items-center bg-surface text-ink-3", tone === "danger" && "text-danger")}>{icon}</span>
              <span className={cn("min-w-0 flex-1 text-meta text-ink-2", tone === "danger" && "text-danger")}>
                {text}
                {it.internal && (
                  <Tip content="Видно только ответственным и руководителям">
                    <Lock className="ml-1.5 inline size-3 text-ink-4" aria-label="внутреннее" />
                  </Tip>
                )}
              </span>
              <time className="shrink-0 text-micro text-ink-3" dateTime={it.createdAt}>
                {fmtDateTime(it.createdAt)}
              </time>
            </li>
          );
        }
        const internal = it.commentKind === "INTERNAL";
        const infoReq = it.commentKind === "INFO_REQUEST";
        const infoResp = it.commentKind === "INFO_RESPONSE";
        return (
          <li key={it.id} className={cn("relative py-3 pl-9", highlightId === it.id && "animate-highlight")}>
            <span className="absolute left-0 top-3">
              <Avatar name={it.author.name === "Автор обращения" ? "А О" : it.author.name} size={24} />
            </span>
            <div className={cn(internal && "rounded-ctl bg-subtle px-3 py-2.5", infoReq && "rounded-ctl px-3 py-2.5")} style={infoReq ? { background: "var(--st-info-bg)" } : undefined}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-ui font-medium text-ink">{it.author.name}</span>
                {it.author.title && <span className="text-meta text-ink-3">{it.author.title}</span>}
                {internal && (
                  <span className="inline-flex items-center gap-1 text-micro text-ink-3">
                    <Lock className="size-3" /> внутренняя заметка · видно только обработчикам
                  </span>
                )}
                {infoReq && (
                  <span className="inline-flex items-center gap-1 text-micro font-medium" style={{ color: "var(--st-info)" }}>
                    <HelpCircle className="size-3" /> запрос уточнения
                  </span>
                )}
                {infoResp && <span className="text-micro font-medium text-ink-2">ответ на уточнение</span>}
                <time className="ml-auto text-micro text-ink-3" dateTime={it.createdAt}>
                  {fmtDateTime(it.createdAt)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-body text-ink">{it.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
