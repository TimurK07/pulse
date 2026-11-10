/** Защитные проверки на изолированной тестовой БД (неразрушающие) */
import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import { ACC, loginAs } from "./helpers";

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

test("подделанный, просроченный и чужой JWT не принимаются", async ({ page, context }) => {
  const forged = await new SignJWT({ role: "ADMIN" }).setProtectedHeader({ alg: "HS256" }).setSubject("x").setExpirationTime("1h").sign(new TextEncoder().encode("wrong-secret-wrong-secret-wrong-secret"));
  const expired = await new SignJWT({ role: "ADMIN" }).setProtectedHeader({ alg: "HS256" }).setSubject("x").setIssuedAt(1).setExpirationTime(2).sign(secret());
  for (const token of [forged, expired, "not.a.jwt", ""]) {
    await context.clearCookies();
    await context.addCookies([{ name: "pulse_session", value: token || "x", url: "http://localhost:3218" }]);
    expect((await page.request.get("/api/me")).status()).toBe(401);
  }
});

test("сессия удалённого пользователя (после пересоздания БД) не зацикливает редиректы", async ({ page, context }) => {
  const stale = await new SignJWT({ role: "MANAGER" }).setProtectedHeader({ alg: "HS256" }).setSubject("deleted-user-id").setExpirationTime("1h").sign(secret());
  await context.addCookies([{ name: "pulse_session", value: stale, url: "http://localhost:3218" }]);
  const res = await page.goto("/pulse");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Вход в PULSE" })).toBeVisible();
});

test("открытый редирект через ?next невозможен", async ({ page }) => {
  for (const next of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByRole("button", { name: /Сотрудник\s+Ирина Волкова/ }).click();
    await page.waitForURL((u) => u.pathname === "/my");
    expect(new URL(page.url()).host).toBe("localhost:3218");
    await page.goto("about:blank");
    await page.context().clearCookies();
  }
});

test("подбор пароля ограничен, подмена X-Forwarded-For не помогает", async ({ page }) => {
  const email = "o.nikitina@pulse.demo"; // аккаунт, который не используется в других сценариях
  let last = 0;
  for (let i = 0; i < 9; i++) {
    const r = await page.request.post("/api/auth/login", { data: { email, password: `wrong-${i}` }, headers: { "x-forwarded-for": `10.0.0.${i}` } });
    last = r.status();
  }
  expect(last).toBe(429);
});

test("повышение роли и чужие действия запрещены", async ({ page }) => {
  await loginAs(page, ACC.employee);
  const me = await (await page.request.get("/api/me")).json();
  expect((await page.request.patch(`/api/admin/users/${me.user.id}`, { data: { role: "ADMIN" } })).status()).toBe(403);
  expect((await page.request.put("/api/admin/routing", { data: {} })).status()).toBe(403);
  expect((await page.request.patch("/api/issues/A-001", { data: { status: "IN_REVIEW" } })).status()).toBe(403); // автор не обработчик
  expect((await page.request.post("/api/issues/A-001/comments", { data: { body: "x", kind: "INTERNAL" } })).status()).toBe(403);
  expect((await page.request.post("/api/ai/digest")).status()).toBe(403);
  expect((await page.request.post("/api/issues/A-003/triage")).status()).toBe(404);
  await loginAs(page, ACC.admin);
  const admin = await (await page.request.get("/api/me")).json();
  expect((await page.request.patch(`/api/admin/users/${admin.user.id}`, { data: { role: "EMPLOYEE" } })).status()).toBe(400);
});

test("XSS и SQL-подобный ввод безопасны", async ({ page }) => {
  await loginAs(page, ACC.employee);
  const meta = await (await page.request.get("/api/meta")).json();
  const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'; DROP TABLE "Issue"; --`;
  const res = await page.request.post("/api/issues", {
    data: { type: "PROBLEM", categoryId: meta.categories[0].id, title: `XSS ${payload}`.slice(0, 140), description: `Проверка экранирования: ${payload}` },
  });
  expect(res.status()).toBe(200);
  const { code } = await res.json();
  await page.goto(`/issues/${code}`);
  await expect(page.getByText(/DROP TABLE/).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  const search = await page.request.get(`/api/issues?view=mine&q=${encodeURIComponent(`' OR 1=1; --`)}`);
  expect(search.status()).toBe(200);
  expect((await search.json()).items).toHaveLength(0);
});

test("CSRF: мутации с чужого сайта отклоняются", async ({ page }) => {
  await loginAs(page, ACC.employee);
  const r1 = await page.request.post("/api/issues/A-009/support", { headers: { Origin: "https://evil.example" } });
  expect(r1.status()).toBe(403);
  const r2 = await page.request.post("/api/issues/A-009/support", { headers: { "Sec-Fetch-Site": "cross-site" } });
  expect(r2.status()).toBe(403);
  const r3 = await page.request.post("/api/auth/login", { headers: { Origin: "https://evil.example" }, data: { email: ACC.employee, password: "pulse-demo" } });
  expect(r3.status()).toBe(403);
});

test("cron-эскалации требуют секрет и идемпотентны", async ({ page }) => {
  expect((await page.request.post("/api/cron/sla")).status()).toBe(403);
  expect((await page.request.post("/api/cron/sla", { headers: { "x-cron-secret": "wrong" } })).status()).toBe(403);
  const ok = await page.request.post("/api/cron/sla", { headers: { "x-cron-secret": "e2e-cron-secret-0123456789" } });
  expect(ok.status()).toBe(200);
  const again = await (await page.request.post("/api/cron/sla", { headers: { "x-cron-secret": "e2e-cron-secret-0123456789" } })).json();
  expect(again.escalated).toBe(0);
});

test("секреты не попадают в клиентский код и ответы", async ({ page }) => {
  await loginAs(page, ACC.admin);
  await page.goto("/admin");
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).filter(Boolean));
  for (const src of scripts) {
    const js = await (await page.request.get(src)).text();
    expect(js).not.toMatch(/sk-ant-|SESSION_SECRET|ANTHROPIC_API_KEY=/);
  }
  const ai = await (await page.request.get("/api/admin/ai")).text();
  expect(ai).not.toMatch(/sk-ant-/);
  const me = await (await page.request.get("/api/me")).text();
  expect(me).not.toMatch(/passwordHash|\$2[aby]\$/);
  const headers = (await page.request.get("/login")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});
