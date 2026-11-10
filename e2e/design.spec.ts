/** Новые взаимодействия после дизайн-доработки: Пульс, ход и следующий шаг, ассистент, поиск в настройках */
import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Пульс: очереди действия ведут в списки, «Что сделать сейчас» — к обращениям", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/pulse");
  const queues = page.getByRole("navigation", { name: "Очереди действия" });
  await expect(queues.getByRole("link")).toHaveCount(4);
  const actions = page.getByRole("region", { name: "Что сделать сейчас" }).getByRole("link");
  await expect(actions.first()).toBeVisible();
  await expect(actions.first()).toHaveAttribute("href", /\/issues\/A-\d+/);
  const load = page.getByRole("region", { name: "Нагрузка ответственных" });
  await expect(load.getByRole("link", { name: /откр\./ }).first()).toHaveAttribute("href", /assignee=/);
  await queues.getByRole("link", { name: /Просрочено/ }).click();
  await expect(page).toHaveURL(/view=overdue/);
  await expect(page.getByRole("heading", { name: "Просрочено", level: 1 })).toBeVisible();
});

test("Карточка: ход рассмотрения и одно основное действие в «Следующем шаге»", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/issues/A-020");
  const progress = page.getByRole("region", { name: "Ход рассмотрения" });
  await expect(progress.locator('[aria-current="step"]')).toContainText("Принято");
  const next = page.getByRole("region", { name: "Следующий шаг" });
  await expect(next).toContainText("Автор ждёт первого ответа");
  const primary = next.getByRole("button").first();
  await expect(primary).toHaveText("Взять на рассмотрение");
  await primary.click();
  await page.getByRole("dialog").getByRole("button", { name: "Взять на рассмотрение" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(progress.locator('[aria-current="step"]')).toContainText("Рассмотрение");
  await expect(next).toContainText("Примите решение");
  // для «Ожидает уточнения» основного действия нет: ждём автора
  await page.goto("/issues/A-005");
  await expect(page.getByRole("region", { name: "Следующий шаг" })).toContainText("Вопрос автору отправлен");
  await expect(page.getByRole("region", { name: "Следующий шаг" }).locator("button.bg-accent")).toHaveCount(0);
});

test("Ассистент: рекомендации отделены от фактов и применяются только по кнопке", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/issues/A-002");
  const before = await (await page.request.get("/api/issues/A-002")).json();
  const assistant = page.getByRole("region", { name: "Ассистент" });
  await assistant.getByRole("button", { name: "Разобрать" }).click();
  await expect(assistant.getByText("ПРАВИЛО")).toBeVisible(); // внешний AI в E2E выключен — честный fallback
  await expect(assistant.getByText("Рекомендации · решение за вами")).toBeVisible();
  await expect(assistant.getByText("Ассистент ничего не меняет сам")).toBeVisible();
  const after = await (await page.request.get("/api/issues/A-002")).json();
  expect(after.priority).toBe(before.priority); // разбор ничего не изменил
  const apply = assistant.getByRole("button", { name: "Применить" });
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(page.getByText(/Приоритет: Средний → Низкий/)).toBeVisible();
});

test("Настройки: поиск и фильтр «Требуют внимания», поиск пользователей и роли", async ({ page }) => {
  await loginAs(page, ACC.admin);
  await page.goto("/admin");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(18);
  await page.getByLabel("Поиск категорий").fill("обуч");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Обучение");
  await page.getByLabel("Поиск категорий").fill("");
  await page.getByRole("radio", { name: /Требуют внимания/ }).click();
  await expect(rows.first()).toContainText("основной отсутствует");
  await page.getByLabel("Поиск категорий").fill("несуществующее");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();

  await page.getByRole("button", { name: "Пользователи и роли" }).click();
  await page.getByLabel("Поиск пользователей").fill("Козлов");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Поиск пользователей").fill("");
  await page.getByRole("radio", { name: /^Администратор/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("radio", { name: /Отсутствуют/ }).click();
  await expect(page.locator("tbody tr")).toContainText(["Виктория Павлова"]);
});
