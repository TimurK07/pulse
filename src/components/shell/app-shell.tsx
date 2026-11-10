"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  CheckCheck,
  ChevronsUpDown,
  Inbox,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  PenLine,
  Search,
  Settings2,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { api } from "@/lib/client/api";
import { fmtShort } from "@/lib/client/format";
import { useMe } from "@/lib/client/queries";
import { setTheme, useTheme } from "@/lib/client/theme";
import { Avatar, Kbd } from "@/components/ui/status";
import { PulseWordmark } from "./logo";
import { ViewerProvider, type Viewer } from "./viewer";
import { CommandPalette } from "./command-palette";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  count?: number;
  alert?: boolean;
  match: (path: string, view: string | null) => boolean;
}

function navFor(role: Role, c: ReturnType<typeof useMe>["data"]): { main: NavItem[]; personal: NavItem[] } {
  const counters = c?.counters;
  const staff = role !== "EMPLOYEE";
  const managerial = role === "MANAGER" || role === "ADMIN";
  const main: NavItem[] = [];
  if (managerial) main.push({ href: "/pulse", label: "Пульс", icon: Activity, match: (p) => p === "/pulse" });
  if (staff) {
    main.push({
      href: "/queue?view=queue",
      label: "Мне назначено",
      icon: Inbox,
      count: counters?.queue,
      match: (p, v) => p === "/queue" && v === "queue",
    });
    main.push({
      href: "/queue?view=open",
      label: "Все обращения",
      icon: LayoutList,
      count: counters?.overdue || undefined,
      alert: !!counters?.overdue,
      match: (p, v) => (p === "/queue" && v !== "queue") || p.startsWith("/issues/"),
    });
    main.push({ href: "/analytics", label: "Аналитика", icon: BarChart3, match: (p) => p === "/analytics" });
  }
  main.push({ href: "/results", label: "Результаты", icon: CheckCheck, match: (p) => p === "/results" });
  if (role === "ADMIN") main.push({ href: "/admin", label: "Настройки", icon: Settings2, match: (p) => p.startsWith("/admin") });

  const personal: NavItem[] = [
    {
      href: "/my",
      label: "Мои обращения",
      icon: UserRound,
      count: counters?.needsMyAnswer || counters?.mineOpen || undefined,
      alert: !!counters?.needsMyAnswer,
      match: (p) => p === "/my",
    },
  ];
  return { main, personal };
}

export function AppShell({ user, children }: { user: Viewer; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const view = search.get("view");
  const me = useMe();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const router = useRouter();
  const { main, personal } = navFor(user.role, me.data);

  const navKey = `${pathname}?${view}`;
  const [lastNavKey, setLastNavKey] = useState(navKey);
  if (lastNavKey !== navKey) {
    // переход по ссылке закрывает мобильное меню
    setLastNavKey(navKey);
    setMobileNav(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c" && pathname !== "/new") {
        e.preventDefault();
        router.push("/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  const overdue = me.data?.counters.overdue ?? 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s/, "");
    document.title = overdue && user.role !== "EMPLOYEE" ? `(${overdue}) ${base}` : base;
  }, [overdue, pathname, user.role]);

  const sidebar = (
    <nav aria-label="Основная навигация" className="flex h-full flex-col gap-1 px-3 pb-3 pt-4">
      <div className="flex items-center justify-between px-2 pb-3">
        <Link href="/" aria-label="PULSE — на главную">
          <PulseWordmark />
        </Link>
        <Notifications unread={me.data?.unread ?? 0} />
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="mb-1 flex h-8 items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 text-ui text-ink-3 transition-colors-fast hover:border-line-strong hover:text-ink-2"
      >
        <Search className="size-3.5" strokeWidth={2} />
        <span className="flex-1 text-left">Поиск</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Link
        href="/new"
        className={cn(
          "mb-3 flex h-8 items-center gap-2 rounded-ctl px-2.5 text-ui font-medium text-ink transition-colors-fast hover:bg-subtle",
          pathname === "/new" && "bg-accent-soft font-semibold shadow-[inset_2px_0_0_var(--accent)]",
        )}
      >
        <PenLine className="size-4" strokeWidth={1.75} />
        <span className="flex-1">Новое обращение</span>
        <Kbd>C</Kbd>
      </Link>

      {user.role === "EMPLOYEE" ? (
        <>
          {/* у сотрудника главное — свои обращения */}
          <NavGroup items={personal} pathname={pathname} view={view} />
          <NavLabel>Компания</NavLabel>
          <NavGroup items={main} pathname={pathname} view={view} />
        </>
      ) : (
        <>
          <NavLabel>Работа</NavLabel>
          <NavGroup items={main} pathname={pathname} view={view} />
          <NavLabel>Лично</NavLabel>
          <NavGroup items={personal} pathname={pathname} view={view} />
        </>
      )}

      <div className="mt-auto">
        <UserMenu user={user} />
      </div>
    </nav>
  );

  return (
    <ViewerProvider value={user}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 lg:block">{sidebar}</aside>

        {/* Мобильная навигация */}
        <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
          <button aria-label="Открыть меню" onClick={() => setMobileNav(true)} className="-ml-1.5 grid size-8 place-items-center rounded-ctl hover:bg-subtle">
            <Menu className="size-5" />
          </button>
          <PulseWordmark />
          <button aria-label="Поиск" onClick={() => setPaletteOpen(true)} className="grid size-8 place-items-center rounded-ctl hover:bg-subtle">
            <Search className="size-4" />
          </button>
        </div>
        {mobileNav && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
            <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setMobileNav(false)} />
            <div className="absolute inset-y-0 left-0 w-[272px] animate-pop-in bg-canvas shadow-[var(--shadow-dialog)]">
              <button aria-label="Закрыть меню" onClick={() => setMobileNav(false)} className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-ctl hover:bg-subtle">
                <X className="size-4" />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 pt-12 lg:py-2 lg:pr-2 lg:pt-2">
          <div className="min-h-[calc(100dvh-3rem)] bg-surface lg:min-h-[calc(100dvh-1rem)] lg:rounded-pop lg:border lg:border-line">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={user.role} />
    </ViewerProvider>
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 px-2.5 pb-1 text-micro font-medium uppercase tracking-[0.08em] text-ink-3 first:mt-0">{children}</div>;
}

function NavGroup({ items, pathname, view }: { items: NavItem[]; pathname: string; view: string | null }) {
  return (
    <ul className="flex flex-col gap-px">
      {items.map((it) => {
        const active = it.match(pathname, view);
        const Icon = it.icon;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-ctl px-2.5 text-ui text-ink-2 transition-colors-fast hover:bg-subtle hover:text-ink",
                active && "bg-accent-soft font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1 truncate">{it.label}</span>
              {!!it.count && (
                <span
                  className={cn(
                    "mono-num min-w-5 rounded-full px-1.5 text-center text-micro leading-[18px]",
                    it.alert ? "bg-danger-soft text-danger" : "text-ink-3",
                  )}
                >
                  {it.count}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserMenu({ user }: { user: Viewer }) {
  const theme = useTheme();
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // полная перезагрузка намеренно: сбрасывает кэш данных предыдущей роли
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = "/login";
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left transition-colors-fast hover:bg-subtle data-[state=open]:bg-subtle">
        <Avatar name={user.name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui font-medium text-ink">{user.name}</span>
          <span className="block truncate text-micro text-ink-3">
            {ROLE_LABEL[user.role]} · {user.title}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 w-[220px] animate-pop-in rounded-pop border border-line bg-raised p-1 shadow-[var(--shadow-pop)]"
        >
          <div className="px-2 py-1.5 text-label text-ink-3">{user.department ?? "Без подразделения"}</div>
          <DropdownMenu.Item onSelect={toggleTheme} className="flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-ui outline-none data-[highlighted]:bg-subtle">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={logout} className="flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-ui outline-none data-[highlighted]:bg-subtle">
            <LogOut className="size-4" />
            Выйти / сменить роль
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  code: string | null;
  read: boolean;
  createdAt: string;
}

function Notifications({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationItem[] }>("/api/notifications"),
    enabled: open,
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications", { all: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const openItem = async (n: NotificationItem) => {
    if (!n.read) {
      await api.post("/api/notifications", { ids: [n.id] }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    setOpen(false);
    if (n.code) router.push(`/issues/${n.code}`);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"}
        className="relative grid size-8 place-items-center rounded-ctl text-ink-2 transition-colors-fast hover:bg-subtle hover:text-ink"
      >
        <Bell className="size-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="mono-num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-none text-accent-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 w-[360px] max-w-[calc(100vw-24px)] animate-pop-in rounded-pop border border-line bg-raised shadow-[var(--shadow-pop)]"
        >
          <div className="flex h-11 items-center justify-between px-4 hairline-b">
            <span className="text-title-md font-semibold">Уведомления</span>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="text-label text-ink-2 hover:text-ink">
                Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {list.isLoading && <div className="px-4 py-6 text-meta text-ink-3">Загрузка…</div>}
            {list.isError && <div className="px-4 py-6 text-meta text-danger">Не удалось загрузить уведомления</div>}
            {list.data?.items.length === 0 && <div className="px-4 py-6 text-meta text-ink-3">Новых событий нет. Здесь появятся ответы и изменения статусов.</div>}
            {list.data?.items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3 text-left transition-colors-fast hairline-b hover:bg-subtle">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-ui", n.read ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-meta text-ink-3">{n.body}</span>}
                </span>
                <span className="shrink-0 text-micro text-ink-3">{fmtShort(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
