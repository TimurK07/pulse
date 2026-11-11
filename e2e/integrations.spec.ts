/** Вкладка «Интеграции»: статус Битрикс24 без раскрытия секретов и защита тестовой отправки */
import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test("администратор видит статус Битрикс24; отправка невозможна, пока интеграция выключена", async ({ page }) => {
  await loginAs(page, ACC.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Интеграции" }).click();
  const card = page.getByRole("region", { name: "Битрикс24" });
  await expect(card.getByText("Не подключено")).toBeVisible();
  await expect(card.getByText("Выключено в настройках окружения")).toBeVisible();
  await expect(card.getByRole("button", { name: "Отправить тестовое сообщение" })).toBeDisabled();
  await expect(page.getByText("Что отправляется")).toBeVisible();
  const res = await page.request.post("/api/admin/integrations/bitrix24/test");
  expect(res.status()).toBe(400);
  expect((await res.json()).error.message).toMatch(/не подключён/);
});

test("статус интеграций доступен только администратору", async ({ page }) => {
  await loginAs(page, ACC.manager);
  expect((await page.request.get("/api/admin/integrations")).status()).toBe(403);
  expect((await page.request.post("/api/admin/integrations/bitrix24/test")).status()).toBe(403);
});
