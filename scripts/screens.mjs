// Скриншоты ключевых экранов для визуальной проверки: node scripts/screens.mjs <outDir> [baseUrl]
import { chromium } from "@playwright/test";
const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3217";
const only = process.argv[4];
const shots = [
  ["login", null, "/login"],
  ["emp-my", "employee@pulse.demo", "/my"],
  ["emp-new", "employee@pulse.demo", "/new"],
  ["emp-issue", "employee@pulse.demo", "/issues/A-004"],
  ["emp-results", "employee@pulse.demo", "/results"],
  ["hdl-queue", "handler@pulse.demo", "/queue?view=queue"],
  ["hdl-issue", "handler@pulse.demo", "/issues/A-007"],
  ["mgr-pulse", "manager@pulse.demo", "/pulse"],
  ["mgr-queue", "manager@pulse.demo", "/queue?view=open"],
  ["mgr-issue", "manager@pulse.demo", "/issues/A-003"],
  ["mgr-analytics", "manager@pulse.demo", "/analytics"],
  ["adm-admin", "admin@pulse.demo", "/admin"],
];
const browser = await chromium.launch();
for (const [name, email, path] of shots) {
  if (only && !name.includes(only)) continue;
  for (const [vw, w, h] of [["d", 1440, 900], ["m", 390, 844]]) {
    if (vw === "m" && !["emp-my", "mgr-queue", "mgr-issue", "login", "emp-new"].includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: "light", locale: "ru-RU" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    if (email) {
      const r = await page.request.post(`${base}/api/auth/login`, { data: { email, password: "pulse-demo" } });
      if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`);
    }
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-${vw}.png`, fullPage: vw === "d" });
    if (errors.length) console.log(name, vw, "ERRORS:", errors.slice(0, 3));
    await ctx.close();
  }
}
await browser.close();
console.log("done");
