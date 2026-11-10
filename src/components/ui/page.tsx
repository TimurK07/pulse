import { cn } from "@/lib/cn";

/**
 * Заголовки страниц. Два уровня по смыслу экрана:
 *  - "statement" — обзорные экраны (Пульс, Мои обращения, Результаты): заголовок-вывод 28px;
 *  - "work" — рабочие инструменты (Очередь, Аналитика, Настройки): 22px, плотнее.
 * Отступы и ширина текста одинаковы во всём приложении.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  kind = "work",
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  kind?: "statement" | "work";
  className?: string;
}) {
  return (
    <header className={cn("px-4 pt-7 sm:px-8", children ? "pb-0" : "pb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[760px]">
          {eyebrow && <p className="mb-1.5 text-label font-medium text-ink-3">{eyebrow}</p>}
          <h1 className={cn("font-semibold text-ink", kind === "statement" ? "text-display" : "text-title-xl")}>{title}</h1>
          {description && <div className="mt-1.5 text-meta text-ink-3">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Заголовок секции: название, счётчик, необязательная ссылка/действие справа */
export function SectionTitle({
  children,
  count,
  action,
  tone,
  hint,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  tone?: "danger" | "warn" | "info";
  hint?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <Tag
        className={cn(
          "text-title-md font-semibold text-ink",
          tone === "danger" && "text-danger",
          tone === "warn" && "text-warn",
        )}
        style={tone === "info" ? { color: "var(--st-info)" } : undefined}
      >
        {children}
      </Tag>
      {count != null && <span className="mono-num text-meta text-ink-3">{count}</span>}
      {hint && <span className="text-meta text-ink-3">{hint}</span>}
      {action && <span className="ml-auto text-meta">{action}</span>}
    </div>
  );
}

/** Микро-заголовок группы внутри панели */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-micro font-medium uppercase tracking-[0.08em] text-ink-3", className)}>{children}</h3>;
}
