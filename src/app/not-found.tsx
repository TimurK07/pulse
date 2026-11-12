import Link from "next/link";

export const metadata = { title: "Страница не найдена" };

// Несуществующие адреса: вместо стандартной англоязычной страницы Next.js
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="max-w-md">
        <p className="mono-id text-meta text-ink-3">404</p>
        <h1 className="mt-2 text-title-md font-semibold text-ink">Страница не найдена</h1>
        <p className="mt-1 text-body text-ink-2">Возможно, ссылка устарела или в адресе опечатка.</p>
        <Link
          href="/"
          className="mt-5 inline-flex h-8 items-center rounded-ctl border border-line-strong bg-raised px-3 text-ui font-medium text-ink hover:bg-subtle"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
