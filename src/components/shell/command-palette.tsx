"use client";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/client/api";
import type { Role } from "@/lib/domain";
import type { IssueListItem } from "@/lib/services/issues";
import { StatusIcon } from "@/components/ui/status";

const PAGES: { label: string; href: string; roles?: Role[] }[] = [
  { label: "Новое обращение", href: "/new" },
  { label: "Мои обращения", href: "/my" },
  { label: "Результаты улучшений", href: "/results" },
  { label: "Пульс — что требует внимания", href: "/pulse", roles: ["MANAGER", "ADMIN"] },
  { label: "Мне назначено", href: "/queue?view=queue", roles: ["HANDLER", "MANAGER", "ADMIN"] },
  { label: "Просроченные обращения", href: "/queue?view=overdue", roles: ["HANDLER", "MANAGER", "ADMIN"] },
  { label: "Все открытые обращения", href: "/queue?view=open", roles: ["HANDLER", "MANAGER", "ADMIN"] },
  { label: "Аналитика", href: "/analytics", roles: ["HANDLER", "MANAGER", "ADMIN"] },
  { label: "Настройки: категории и маршрутизация", href: "/admin", roles: ["ADMIN"] },
];

export function CommandPalette({ open, onOpenChange, role }: { open: boolean; onOpenChange: (v: boolean) => void; role: Role }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  const view = role === "EMPLOYEE" ? "mine" : "all";
  const results = useQuery({
    queryKey: ["search", view, debounced],
    queryFn: () => api.get<{ items: IssueListItem[] }>(`/api/issues${qs({ view, q: debounced, limit: "8" })}`),
    enabled: open && debounced.trim().length >= 2,
  });

  const go = (href: string) => {
    setQ("");
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) setQ("");
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[14vh] z-50 w-[600px] max-w-[calc(100vw-24px)] -translate-x-1/2 overflow-hidden rounded-dlg border border-line bg-raised shadow-[var(--shadow-dialog)]"
        >
          <Dialog.Title className="sr-only">Поиск и навигация</Dialog.Title>
          <Command shouldFilter={false} loop>
            <Command.Input
              value={q}
              onValueChange={setQ}
              autoFocus
              placeholder="Код, слово из заголовка или раздел…"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-4"
            />
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5 scrollbar-thin">
              <Command.Empty className="px-3 py-6 text-meta text-ink-3">
                {debounced.length >= 2 && results.isFetching ? "Ищем…" : "Ничего не найдено"}
              </Command.Empty>
              {!!results.data?.items.length && (
                <Command.Group heading="Обращения" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3">
                  {results.data.items.map((i) => (
                    <Command.Item
                      key={i.id}
                      value={i.code}
                      onSelect={() => go(`/issues/${i.code}`)}
                      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 text-ui data-[selected=true]:bg-subtle"
                    >
                      <StatusIcon status={i.status} />
                      <span className="mono-id w-12 text-ink-3">{i.code}</span>
                      <span className="truncate">{i.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Разделы" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3">
                {PAGES.filter((p) => !p.roles || p.roles.includes(role))
                  .filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()))
                  .map((p) => (
                    <Command.Item
                      key={p.href}
                      value={p.href}
                      onSelect={() => go(p.href)}
                      className="flex h-9 cursor-pointer items-center rounded-ctl px-2.5 text-ui text-ink-2 data-[selected=true]:bg-subtle data-[selected=true]:text-ink"
                    >
                      {p.label}
                    </Command.Item>
                  ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
