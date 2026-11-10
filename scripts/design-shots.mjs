// Снимки всех ключевых экранов для дизайн-аудита: node scripts/design-shots.mjs <outDir> [baseUrl]
// Только чтение: ничего не создаёт и не меняет в данных (AI-шаг подачи берётся из кэша).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:3217";
mkdirSync(out, { recursive: true });
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };
const DRAFT = { t: "Не видно, на каком этапе согласование документов", d: "Когда пакет документов уходит в другое подразделение, непонятно, на каком этапе он сейчас и кто ответственный. Приходится звонить и уточнять статус, это отнимает время каждый день." };
const shots = [
  ["01-login", null, "/login", D, "light"],
  ["02-my", "employee", "/my", D, "light"],
  ["03-new", "employee", "/new", D, "light"],
  ["04-new-review", "employee", "/new", D, "light", async (p) => { await p.getByLabel(/Коротко/).fill(DRAFT.t); await p.getByLabel(/Подробности/).fill(DRAFT.d); await p.getByRole("button", { name: /Далее/ }).click(); await p.getByRole("heading", { name: "Проверьте и отправьте" }).waitFor({ timeout: 30000 }); }],
  ["05-issue-author", "employee", "/issues/A-004", D, "light"],
  ["06-issue-staff", "manager", "/issues/A-013", D, "light"],
  ["07-issue-dialog", "manager", "/issues/A-003", D, "light", async (p) => { await p.getByRole("button", { name: /Отклонить с объяснением/ }).first().click(); await p.getByRole("dialog").waitFor(); }],
  ["08-queue", "handler", "/queue?view=queue", D, "light"],
  ["09-queue-all", "manager", "/queue?view=open", D, "light"],
  ["10-pulse", "manager", "/pulse", D, "light"],
  ["11-analytics", "manager", "/analytics", D, "light"],
  ["12-digest", "manager", "/analytics", D, "light", async (p) => { await p.getByRole("region", { name: "Сводка для руководства" }).scrollIntoViewIfNeeded(); }],
  ["13-results", "employee", "/results", D, "light"],
  ["14-notifications", "employee", "/my", D, "light", async (p) => { await p.getByRole("button", { name: /Уведомления/ }).click(); await p.waitForTimeout(300); }],
  ["15-admin", "admin", "/admin", D, "light"],
  ["16-admin-users", "admin", "/admin", D, "light", async (p) => { await p.getByRole("button", { name: "Пользователи и роли" }).click(); }],
  ["17-admin-ai", "admin", "/admin", D, "light", async (p) => { await p.getByRole("button", { name: "AI" }).click(); await p.waitForTimeout(400); }],
  ["18-pulse-dark", "manager", "/pulse", D, "dark"],
  ["19-issue-dark", "manager", "/issues/A-013", D, "dark"],
  ["20-m-pulse", "manager", "/pulse", M, "light"],
  ["21-m-issue", "manager", "/issues/A-003", M, "light"],
  ["22-m-my", "employee", "/my", M, "light"],
  ["23-m-new", "employee", "/new", M, "light"],
];
const browser = await chromium.launch();
for (const [name, role, path, vp, theme, act] of shots) {
  const ctx = await browser.newContext({ viewport: vp, locale: "ru-RU", colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("pulse-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (role) await page.request.post(`${base}/api/auth/login`, { data: { email: `${role}@pulse.demo`, password: "pulse-demo" } });
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (act) await act(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  if (errors.length) console.log(name, "ERRORS:", errors.slice(0, 2));
  await ctx.close();
}
await browser.close();
console.log("done", shots.length);
