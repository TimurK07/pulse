import { cn } from "@/lib/cn";

export function EmptyState({ title, text, action, className }: { title: string; text?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-md px-6 py-16", className)}>
      <h3 className="text-title-md font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 text-body text-ink-2">{text}</p>}
      {action && <div className="mt-4 flex gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="max-w-md px-6 py-16" role="alert">
      <h3 className="text-title-md font-semibold text-ink">Не удалось загрузить данные</h3>
      <p className="mt-1 text-body text-ink-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 h-8 rounded-ctl border border-line-strong bg-raised px-3 text-ui font-medium hover:bg-subtle">
          Повторить
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-ctl bg-subtle", className)} style={style} />;
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-6 hairline-b">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${30 + ((i * 37) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}
