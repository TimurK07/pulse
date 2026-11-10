/**
 * Все основные экраны на 5 ширинах: без горизонтальной прокрутки, без ошибок
 * в консоли (включая гидратацию). Доступность — axe-core (WCAG 2.1 A/AA),
 * критичные и серьёзные нарушения недопустимы.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ACC, loginAs } from "./helpers";

const WIDTHS = [1440, 1280, 768, 390, 375];
const SCREENS: { who: string; paths: string[] }[] = [
  { who: ACC.employee, paths: ["/my", "/new", "/issues/A-004", "/results"] },
  { who: ACC.handler, paths: ["/queue?view=queue", "/issues/A-007", "/analytics"] },
  { who: ACC.manager, paths: ["/pulse", "/queue?view=open", "/issues/A-003", "/analytics"] },
  { who: ACC.admin, paths: ["/admin"] },
];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

for (const { who, paths } of SCREENS) {
  test(`адаптивность и консоль: ${who}`, async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, who);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const path of paths) {
        await page.goto(path, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect.soft(overflow, `${path} @${w}px: горизонтальная прокрутка`).toBeLessThanOrEqual(1);
      }
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("страница входа без ошибок на всех ширинах", async ({ page }) => {
  const errors = watchErrors(page);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/login", { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect.soft(overflow, `/login @${w}px`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

const A11Y: { who: string | null; path: string }[] = [
  { who: null, path: "/login" },
  { who: ACC.employee, path: "/my" },
  { who: ACC.employee, path: "/new" },
  { who: ACC.manager, path: "/pulse" },
  { who: ACC.manager, path: "/queue?view=open" },
  { who: ACC.manager, path: "/issues/A-003" },
  { who: ACC.manager, path: "/analytics" },
  { who: ACC.admin, path: "/admin" },
];

for (const { who, path } of A11Y) {
  test(`доступность (axe): ${path}`, async ({ page }) => {
    if (who) await loginAs(page, who);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path, { waitUntil: "networkidle" });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")} — ${v.help}`).join("\n");
    expect(serious, summary).toEqual([]);
  });
}

test("клавиатура: ⌘K, переход по списку J/K и Enter, Esc закрывает диалог", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/queue?view=open", { waitUntil: "networkidle" });
  await page.keyboard.press("j");
  await expect(page.locator("[data-row]").first()).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.locator("[data-row]").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/issues\/A-\d+/);
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.type("A-003");
  await expect(dialog.getByRole("option", { name: /A-003/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/new$/);
});
