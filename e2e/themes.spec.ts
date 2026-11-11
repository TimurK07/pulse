/**
 * Системное решение по повторяющейся теме: руководитель на «Пульсе» решает тему целиком,
 * автор видит в карточке, что его обращение решается вместе с похожими.
 * Файл выполняется после остальных desktop-сценариев: меняет статусы A-002, A-005, A-011.
 */
import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test("руководитель решает тему «Прозрачность статусов» одним действием", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/pulse");
  const themes = page.getByRole("region", { name: "Повторяющиеся проблемы" });
  const item = themes.getByRole("listitem").filter({ hasText: "Прозрачность статусов" });
  await item.getByRole("button", { name: "Решить тему →" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Решить тему целиком" })).toBeVisible();
  await expect(dialog.getByLabel("Тема")).toHaveValue(/Прозрачность статусов/);
  for (const code of ["A-002", "A-005", "A-011"]) await expect(dialog.getByLabel(`Включить ${code}`)).toBeChecked();

  await dialog.getByRole("radio", { name: "Реализовано" }).click();
  const submit = dialog.getByRole("button", { name: "Закрыть тему: реализовано" });
  await expect(submit).toBeDisabled(); // без текста решения нельзя
  await dialog.getByLabel(/Что сделано/).fill("Во всех заявках появилась лента этапов согласования: текущий этап, исполнитель и срок.");
  await submit.click();

  await expect(dialog.getByRole("heading", { name: "Системное решение принято" })).toBeVisible();
  await expect(dialog).toContainText("одним действием");
  await expect(dialog).toContainText("уведомление");
  await dialog.getByRole("button", { name: "Готово" }).click();

  const api = await (await page.request.get("/api/issues/A-005")).json();
  expect(api.status).toBe("IMPLEMENTED");
  expect(api.themeDecision.total).toBe(3);
});

test("автор видит, что обращение решено системно вместе с похожими", async ({ page }) => {
  await loginAs(page, ACC.employee); // автор A-002 в демо-данных
  await page.goto("/issues/A-002");
  const block = page.getByRole("region", { name: "Системное решение" });
  await expect(block).toContainText("Решается системно");
  await expect(block.getByRole("link", { name: "A-005" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Итог рассмотрения" })).toContainText("лента этапов согласования");
});

test("системное решение доступно только руководителю", async ({ page }) => {
  await loginAs(page, ACC.handler);
  const res = await page.request.post("/api/themes", { data: { title: "Тема", codes: ["A-007"], status: "IN_PROGRESS", text: "Попытка ответственного принять решение по теме" } });
  expect(res.status()).toBe(403);
});
