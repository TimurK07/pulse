import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homeFor } from "@/lib/nav";
import { safeNext } from "@/lib/safe-redirect";
import { PulseWordmark } from "@/components/shell/logo";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, EXTRA_DEMO } from "@/lib/demo-accounts";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeNext(sp.next, homeFor(user.role)));
  const next = safeNext(sp.next);
  const demo = process.env.DEMO_MODE === "true";
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line px-14 py-12 lg:flex">
        <PulseWordmark />
        <div className="max-w-[520px]">
          <p className="mono-id mb-6 text-ink-3">ГК «МОДУС ТРЕЙД» · ВНУТРЕННИЙ КАНАЛ УЛУЧШЕНИЙ</p>
          <h1 className="text-[44px] font-semibold leading-[50px] tracking-[-0.03em] text-ink">
            Every voice
            <br />
            moves us forward.
          </h1>
          <p className="mt-5 max-w-[440px] text-[17px] leading-7 text-ink-2">
            Сотрудники сообщают о проблемах и предлагают улучшения. Каждое обращение получает ответственного, срок и зафиксированный результат.
          </p>
          <dl className="mt-10 grid max-w-[480px] grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ["Маршрут", "по правилам категории с резервным ответственным"],
              ["Срок", "реакции и решения по приоритету, эскалация просрочек"],
              ["Итог", "решение или мотивированный отказ видит автор"],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="text-label font-semibold uppercase tracking-[0.08em] text-ink">{t}</dt>
                <dd className="mt-1.5 text-meta text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <PulseLine />
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mb-10 lg:hidden">
          <PulseWordmark />
        </div>
        <div className="w-full max-w-[400px]">
          <h2 className="text-title-xl font-semibold">Вход в PULSE</h2>
          <p className="mt-1 text-body text-ink-2">Используйте корпоративную почту.</p>
          <LoginForm
            next={next}
            demoPassword={demo ? DEMO_PASSWORD : null}
            accounts={demo ? DEMO_ACCOUNTS.map((a) => ({ ...a })) : []}
            extra={demo ? EXTRA_DEMO.map((a) => ({ ...a })) : []}
          />
        </div>
      </section>
    </div>
  );
}

function PulseLine() {
  return (
    <svg viewBox="0 0 600 80" className="h-20 w-full max-w-[600px] text-line-strong" aria-hidden>
      <path
        d="M0 50 H180 L200 50 L214 22 L232 70 L250 10 L268 58 L280 50 H420 L436 40 L450 50 H600"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="250" cy="10" r="4" fill="var(--accent)" />
    </svg>
  );
}
