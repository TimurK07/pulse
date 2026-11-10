import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test.describe.configure({ mode: "serial" });

let code = "";

test("вход через форму и демо-доступ", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ACC.employee);
  await page.getByLabel("Пароль").fill("неверный");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный email или пароль")).toBeVisible();
  await page.getByRole("button", { name: /Сотрудник\s+Ирина Волкова/ }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("heading", { name: /Здравствуйте, Ирина/ })).toBeVisible();
});

test("сотрудник подаёт обращение: валидация, категория, похожие, файл", async ({ page }) => {
  await loginAs(page, ACC.employee);
  await page.goto("/new");
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByText("Минимум 5 символов")).toBeVisible();

  await page.getByRole("radio", { name: /Проблема/ }).click();
  await page.getByLabel(/Коротко, в одной фразе/).fill("Не видно, на каком этапе согласование документов");
  await page
    .getByLabel(/Подробности/)
    .fill("Когда пакет документов уходит в другое подразделение, непонятно, на каком этапе он сейчас и кто ответственный. Приходится звонить и уточнять статус.");
  await page.locator("#files").setInputFiles({ name: "пример.txt", mimeType: "text/plain", buffer: Buffer.from("тестовый файл-заглушка") });
  await expect(page.getByText("пример.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Далее/ }).click();

  await expect(page.getByRole("heading", { name: "Проверьте и отправьте" })).toBeVisible();
  // Без ключа Anthropic работает локальный алгоритм и это явно подписано
  await expect(page.getByText(/ИИ|ПРАВИЛО/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Похожие обращения" })).toContainText("A-005");

  const category = page.getByLabel("Категория");
  if (!(await category.inputValue())) await category.selectOption({ label: "Документооборот" });
  await page.getByText("Скрыть моё имя от обработчиков").click();
  await page.getByRole("button", { name: "Отправить обращение" }).click();

  await expect(page.getByRole("heading", { name: "Обращение зарегистрировано" })).toBeVisible();
  code = (await page.locator("p.mono-id").first().textContent())!.trim();
  expect(code).toMatch(/^A-\d{3}$/);
  await page.getByRole("link", { name: "Открыть обращение" }).click();
  await expect(page.getByRole("link", { name: /пример\.txt/ })).toBeVisible();
  await expect(page.getByText("имя скрыто от обработчиков")).toBeVisible();
});

test("ответственный запрашивает уточнение, автор отвечает, история сохраняется", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto(`/issues/${code}`);
  // автор анонимен для обработчика
  await expect(page.getByText("Автор скрыт", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Запросить уточнение" }).first().click();
  await page.getByLabel(/Вопрос автору/).fill("Какие именно виды документов чаще всего теряются?");
  await page.getByRole("dialog").getByRole("button", { name: "Запросить уточнение" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("запрос уточнения", { exact: true })).toBeVisible();

  await loginAs(page, ACC.employee);
  await page.goto("/my");
  await expect(page.getByRole("region", { name: "Нужен ваш ответ" })).toContainText(code);
  await page.goto(`/issues/${code}`);
  await expect(page.getByText("Ответственный задал вопрос")).toBeVisible();
  await page.getByLabel("Ответ на уточнение").fill("Чаще всего акты сверки и счета на оплату.");
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByText("ответ на уточнение", { exact: true })).toBeVisible();
  await expect(page.getByText("На рассмотрении").first()).toBeVisible();
});

test("мотивированный отказ: короткое обоснование не принимается, автор видит итог", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto(`/issues/${code}`);
  await page.getByRole("button", { name: "Отклонить с объяснением" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Мотивированный отказ/).fill("Нет.");
  await expect(dialog.getByRole("button", { name: "Отклонить с объяснением" })).toBeDisabled();
  await dialog.getByLabel(/Мотивированный отказ/).fill("Задача уже решается в рамках A-005: там готовим отображение этапов согласования.");
  await dialog.getByRole("button", { name: "Отклонить с объяснением" }).click();
  await expect(dialog).toBeHidden();

  await loginAs(page, ACC.employee);
  await page.goto(`/issues/${code}`);
  await expect(page.getByRole("region", { name: "Итог рассмотрения" })).toContainText("Задача уже решается в рамках A-005");
});

test("ответственный видит только свои обращения; сотрудник — не чужие", async ({ page }) => {
  await loginAs(page, ACC.handler);
  await page.goto("/queue?view=queue");
  await expect(page.getByRole("link", { name: /A-007/ })).toBeVisible();
  const forbidden = await page.request.get("/api/issues/A-003");
  expect(forbidden.status()).toBe(404);
  const patch = await page.request.patch("/api/issues/A-003", { data: { status: "IN_REVIEW" } });
  expect(patch.status()).toBe(404);

  await loginAs(page, ACC.employee);
  expect((await page.request.get("/api/analytics")).status()).toBe(403);
  expect((await page.request.get("/api/admin/categories")).status()).toBe(403);
  await page.goto("/issues/A-003");
  await expect(page.getByRole("heading", { name: "Обращение не найдено" })).toBeVisible();
});

test("руководитель: просроченные, фильтры, назначение", async ({ page }) => {
  await loginAs(page, ACC.manager);
  await page.goto("/pulse");
  await expect(page.getByRole("region", { name: "Просрочено" })).toContainText("A-003");
  await page.goto("/queue?view=overdue");
  await expect(page.getByRole("link", { name: /A-003/ })).toBeVisible();
  await page.goto("/queue?view=all");
  await page.getByLabel("Подразделение").selectOption({ label: "Бухгалтерия" });
  await expect(page).toHaveURL(/departmentId=/);
  await expect(page.getByRole("link", { name: /A-007/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /A-009/ })).toHaveCount(0);

  await page.goto("/issues/A-001");
  await page.getByLabel("Ответственный").selectOption({ label: "Константин Зайцев" });
  await expect(page.getByText("Ответственный: Константин Зайцев")).toBeVisible();
});

test("аналитика считает показатели из базы", async ({ page }) => {
  await loginAs(page, ACC.manager);
  const a = await (await page.request.get("/api/analytics")).json();
  expect(a.totals.total).toBeGreaterThanOrEqual(20);
  expect(a.themes.length).toBeGreaterThanOrEqual(3);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Повторяющиеся проблемы" })).toBeVisible();
  await expect(page.getByText("Актуальность данных и версий документов").first()).toBeVisible();
  await page.getByRole("button", { name: "Сформировать сводку" }).click();
  await expect(page.getByRole("heading", { name: "Системные проблемы" })).toBeVisible({ timeout: 40_000 });
});

test("админ: отпуск ответственного переключает маршрут на резервного", async ({ page }) => {
  await loginAs(page, ACC.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Пользователи и роли" }).click();
  await page.getByRole("switch", { name: "Наталья Егорова на месте" }).click();
  await expect(page.getByRole("switch", { name: "Наталья Егорова на месте" })).toHaveAttribute("aria-checked", "false");

  await loginAs(page, ACC.employee);
  const meta = await (await page.request.get("/api/meta")).json();
  const cat = meta.categories.find((c: { name: string }) => c.name === "Каталог и данные");
  const res = await page.request.post("/api/issues", {
    data: { type: "PROBLEM", categoryId: cat.id, title: "Дубли карточек позиций", description: "В каталоге встречаются дубли карточек одной позиции с разными обозначениями." },
  });
  const created = await res.json();
  expect(created.route.via).toBe("backup");
  expect(created.route.assigneeName).toBe("Павел Громов");
});

test("ошибки ввода и защита API", async ({ page }) => {
  await loginAs(page, ACC.employee);
  const bad = await page.request.post("/api/issues", { data: { type: "PROBLEM", categoryId: "x", title: "abc", description: "коротко" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.message).toMatch(/минимум/);
  const foreign = await page.request.post("/api/issues", { headers: { Origin: "https://evil.example" }, data: {} });
  expect(foreign.status()).toBe(403);
  await page.context().clearCookies();
  expect((await page.request.get("/api/issues")).status()).toBe(401);
});
