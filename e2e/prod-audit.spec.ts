/** Регрессии E2E-аудита рабочего стенда (неразрушающие проверки на тестовой БД) */
import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test("ошибки формы подачи исчезают, когда поле исправлено", async ({ page }) => {
  await loginAs(page, ACC.employee);
  await page.goto("/new");
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByText("Минимум 5 символов")).toBeVisible();
  await page.getByLabel(/Коротко, в одной фразе/).fill("Принтер печатает пустые листы");
  await expect(page.getByText("Минимум 5 символов")).toBeHidden();

  await page.getByLabel(/Подробности/).fill("Сетевой принтер на третьем этаже выдаёт пустые листы при печати из 1С, из Word печатает нормально.");
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByRole("heading", { name: "Проверьте и отправьте" })).toBeVisible();
  // «1С» — ключевое слово категории «Интеграции и IT»: локальный классификатор её находит
  await expect(page.getByLabel("Категория")).toHaveValue(/.+/);
  await expect(page.locator("#category option:checked")).toHaveText("Интеграции и IT");

  await page.getByLabel("Категория").selectOption({ index: 0 });
  await page.getByRole("button", { name: "Отправить обращение" }).click();
  await expect(page.getByText("Выберите категорию", { exact: true }).last()).toBeVisible();
  await expect(page.getByLabel("Категория")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Категория").selectOption({ label: "Интеграции и IT" });
  await expect(page.getByLabel("Категория")).not.toHaveAttribute("aria-invalid", "true");
});

test("итог закрытого обращения виден не только автору, но и обработчику", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/issues/A-004");
  const outcome = page.getByRole("region", { name: "Итог рассмотрения" });
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText("Запланирован пробный обучающий семинар");
});

test("несуществующий адрес — страница 404 на русском", async ({ page }) => {
  await loginAs(page, ACC.employee);
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toBeVisible();
});
