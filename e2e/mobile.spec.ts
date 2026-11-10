import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test("мобильная версия: меню, очередь и карточка без горизонтальной прокрутки", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/queue?view=open");
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(page.getByRole("dialog", { name: "Меню" })).toBeVisible();
  await page.getByRole("dialog", { name: "Меню" }).getByRole("link", { name: "Аналитика" }).click();
  await expect(page).toHaveURL(/analytics/);
  await page.goto("/issues/A-003");
  await expect(page.getByRole("button", { name: "Отметить реализованным" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
