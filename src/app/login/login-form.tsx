"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

interface Account {
  email: string;
  name: string;
  role: string;
  title: string;
  scenario: string;
}

/**
 * demoPassword передаётся с сервера только в демо-режиме (DEMO_MODE=true):
 * вне демо пароль не попадает в клиентский код.
 */
export function LoginForm({
  next,
  accounts,
  extra,
  demoPassword,
}: {
  next: string;
  accounts: Account[];
  extra: { email: string; name: string; note: string }[];
  demoPassword: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function login(e: string, p: string) {
    setError(null);
    setPending(e);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Не удалось войти");
      location.href = next;
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Нет соединения с сервером");
      setPending(null);
    }
  }

  return (
    <>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) login(email.trim(), password);
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" />
        </div>
        <div>
          <Label htmlFor="password">Пароль</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending === email.trim() && !!email} disabled={!!pending}>
          Войти
        </Button>
      </form>

      {demoPassword && accounts.length > 0 && (
        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <h3 className="text-label font-semibold uppercase tracking-[0.08em] text-ink">Демо-доступ</h3>
            <span className="text-micro text-ink-3">пароль: <span className="font-mono">{demoPassword}</span></span>
          </div>
          <ul className="mt-3 border-t border-line">
            {accounts.map((a) => (
              <li key={a.email}>
                <button
                  onClick={() => login(a.email, demoPassword)}
                  disabled={!!pending}
                  className="group flex w-full items-start gap-3 border-b border-line py-3 text-left transition-colors-fast hover:bg-subtle/60 disabled:opacity-60"
                >
                  <span className="w-[108px] shrink-0 pt-px text-label font-semibold text-ink">{a.role}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui text-ink">
                      {a.name} <span className="text-ink-3">· {a.title}</span>
                    </span>
                    <span className="mt-0.5 block text-meta text-ink-3">{a.scenario}</span>
                  </span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-4 transition-colors-fast group-hover:text-ink" />
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-meta text-ink-3">
            <summary className="cursor-pointer select-none hover:text-ink-2">Другие участники сценариев</summary>
            <ul className="mt-2 space-y-1">
              {extra.map((x) => (
                <li key={x.email}>
                  <button onClick={() => login(x.email, demoPassword)} className="text-left hover:text-ink" disabled={!!pending}>
                    <span className="text-ink-2">{x.name}</span> — {x.note}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
