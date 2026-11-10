/**
 * Сквозные сценарии всех ролей, не покрытые core-flow: выход, комментарии и
 * внутренние заметки, приоритет, файлы (загрузка/скачивание), поддержка,
 * уведомления, взять себе, правила маршрутизации и сроки, доска результатов.
 */
import { expect, test } from "@playwright/test";
import { ACC, loginAs } from "./helpers";

test.describe.configure({ mode: "serial" });

test("выход из системы закрывает доступ", async ({ page }) => {
  await loginAs(page, ACC.employee);
  await page.goto("/my");
  await page.getByRole("button", { name: /Ирина Волкова/ }).click();
  await page.getByRole("menuitem", { name: /Выйти/ }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.goto("/my");
  await expect(page).toHaveURL(/\/login\?next=%2Fmy/);
});

test("ответ автору виден ему, внутренняя заметка — нет; приоритет меняется", async ({ page }) => {
  await loginAs(page, ACC.handler);
  await page.goto("/issues/A-007");
  await page.getByLabel("Комментарий").fill("Собираем перечень систем, вернусь с оценкой.");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Собираем перечень систем, вернусь с оценкой.")).toBeVisible();
  await page.getByRole("radio", { name: /Внутренняя заметка/ }).click();
  await page.getByLabel("Комментарий").fill("Внутреннее: пересекается с задачей по 1С.");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Внутреннее: пересекается с задачей по 1С.")).toBeVisible();
  await page.getByLabel("Приоритет", { exact: true }).selectOption({ label: "Средний" });
  await expect(page.getByText(/Приоритет: Высокий → Средний/)).toBeVisible();
  // первая реакция зафиксирована публичным ответом
  await expect(page.getByText("просрочено").first()).toBeHidden();

  await loginAs(page, ACC.buh);
  await page.goto("/issues/A-007");
  await expect(page.getByText("Собираем перечень систем, вернусь с оценкой.")).toBeVisible();
  await expect(page.getByText("Внутреннее: пересекается с задачей по 1С.")).toHaveCount(0);
  await expect(page.getByText(/Приоритет: Высокий/)).toHaveCount(0); // внутреннее событие
  const api = await (await page.request.get("/api/issues/A-007")).json();
  expect(JSON.stringify(api)).not.toContain("пересекается с задачей");
});

test("уведомления: автор получает ответ, отмечает прочитанным и переходит в карточку", async ({ page }) => {
  await loginAs(page, ACC.buh);
  await page.goto("/my");
  const bell = page.getByRole("button", { name: /Уведомления/ });
  await expect(bell).toHaveAccessibleName(/непрочитанных/);
  await bell.click();
  await page.getByRole("button", { name: /A-007: новый ответ/ }).click();
  await expect(page).toHaveURL(/\/issues\/A-007/);
  await page.getByRole("button", { name: /Уведомления/ }).click();
  await page.getByRole("button", { name: "Прочитать все" }).click();
  await expect(page.getByRole("button", { name: "Уведомления", exact: true })).toBeVisible();
});

test("файлы: загрузка, скачивание с проверкой содержимого, отказ подложным и чужим", async ({ page }) => {
  await loginAs(page, ACC.employee);
  await page.goto("/issues/A-001");
  await page.locator("#attach").setInputFiles({ name: "заявка-пример.csv", mimeType: "text/csv", buffer: Buffer.from("поле;значение\nназначение;пример") });
  const link = page.getByRole("link", { name: /заявка-пример\.csv/ });
  await expect(link).toBeVisible();
  const download = await Promise.all([page.waitForEvent("download"), link.click()]).then(([d]) => d);
  expect(download.suggestedFilename()).toBe("заявка-пример.csv");
  const body = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(body).toString()).toContain("назначение;пример");

  // исполняемый файл под видом PDF
  const fake = await page.request.post("/api/issues/A-001/attachments", {
    multipart: { files: { name: "счёт.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 not a pdf") } },
  });
  expect(fake.status()).toBe(400);
  expect((await fake.json()).error.message).toMatch(/не соответствует формату/);
  const svg = await page.request.post("/api/issues/A-001/attachments", {
    multipart: { files: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)>") } },
  });
  expect(svg.status()).toBe(400);

  const issue = await (await page.request.get("/api/issues/A-001")).json();
  const fileId = issue.attachments[0].id;
  await loginAs(page, ACC.sales);
  expect((await page.request.get(`/api/attachments/${fileId}`)).status()).toBe(404); // чужой файл
  expect((await page.request.get(`/api/attachments/..%2F..%2F.env.local`)).status()).toBe(404);
});

test("поддержка: коллега поддерживает обращение и видит его публичную версию", async ({ page }) => {
  await loginAs(page, ACC.sales);
  const res = await page.request.post("/api/issues/A-019/support");
  expect((await res.json()).supported).toBe(true);
  await page.goto("/issues/A-019");
  await expect(page.getByText(/потому что поддержали его/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Вы поддержали/ })).toBeVisible();
  const api = await (await page.request.get("/api/issues/A-019")).json();
  expect(api.author).toBeNull();
  expect(api.timeline).toHaveLength(0);
  expect(api.attachments).toHaveLength(0);
  await page.goto("/my");
  await expect(page.getByRole("region", { name: "Вы поддержали" })).toContainText("A-019");
  // собственное обращение поддержать нельзя
  await loginAs(page, ACC.coord);
  expect((await page.request.post("/api/issues/A-019/support")).status()).toBe(400);
});

test("ответственный забирает обращение своей категории себе", async ({ page }) => {
  // A-012 «Коммуникации» назначено Роману; руководитель переназначает на другого
  await loginAs(page, ACC.manager);
  const staff = (await (await page.request.get("/api/meta")).json()).staff as { id: string; name: string }[];
  const other = staff.find((s) => s.name === "Константин Зайцев")!;
  expect((await page.request.patch("/api/issues/A-012", { data: { assigneeId: other.id } })).status()).toBe(200);
  await loginAs(page, ACC.handler);
  await page.goto("/issues/A-012");
  await page.getByRole("button", { name: "Взять себе" }).click();
  await expect.poll(async () => (await (await page.request.get("/api/issues/A-012")).json()).assignee?.name).toBe("Роман Козлов");
  await expect(page.getByRole("button", { name: "Взять себе" })).toHaveCount(0);
  // а назначить на третье лицо ответственный не может
  const deny = await page.request.patch("/api/issues/A-012", { data: { assigneeId: other.id } });
  expect(deny.status()).toBe(403);
});

test("администратор меняет правило маршрутизации и норматив срока", async ({ page }) => {
  await loginAs(page, ACC.admin);
  await page.goto("/admin");
  const backup = page.getByLabel("Резервный ответственный для Регламенты");
  await backup.selectOption({ label: "Анна Ковалёва" });
  await expect(page.getByText("Правило маршрутизации сохранено")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Резервный ответственный для Регламенты")).toHaveValue(/.+/);
  expect(await page.getByLabel("Резервный ответственный для Регламенты").locator("option:checked").textContent()).toContain("Анна Ковалёва");

  await page.getByRole("button", { name: "Сроки" }).click();
  await page.getByLabel("Первая реакция, ч").first().fill("12");
  await page.getByRole("button", { name: "Сохранить" }).first().click();
  await expect(page.getByText("Норматив сохранён")).toBeVisible();
  const meta = await (await page.request.get("/api/meta")).json();
  expect(meta.sla.HIGH.firstResponseHours).toBe(12);
  // восстановить норматив для остальных тестов
  await page.request.put("/api/admin/sla", { data: { priority: "HIGH", firstResponseHours: 24, resolutionDays: 7 } });

  await page.getByRole("button", { name: "AI" }).click();
  await expect(page.getByText(/Выключен в \.env/)).toBeVisible();
});

test("деактивация ответственного передаёт его открытые обращения", async ({ page }) => {
  await loginAs(page, ACC.admin);
  const users = (await (await page.request.get("/api/admin/users")).json()).users as { id: string; email: string }[];
  const sidorov = users.find((u) => u.email === "o.sidorov@pulse.demo")!;
  const r = await (await page.request.patch(`/api/admin/users/${sidorov.id}`, { data: { isActive: false } })).json();
  expect(r.rerouted).toBeGreaterThanOrEqual(1);
  const issue = await (await page.request.get("/api/issues/A-019")).json();
  expect(issue.assignee?.name).toBe("Светлана Белова"); // резервный по категории
  await page.request.patch(`/api/admin/users/${sidorov.id}`, { data: { isActive: true } });
});

test("доска результатов показывает итоги без авторов", async ({ page }) => {
  await loginAs(page, ACC.sales);
  await page.goto("/results");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/внедрен/);
  await expect(page.getByText("Короткие занятия по новым товарным линейкам")).toBeVisible();
  const api = await (await page.request.get("/api/results")).json();
  expect(JSON.stringify(api)).not.toMatch(/authorId|Ирина Волкова/);
});

test("ответственный видит аналитику только по своим обращениям, без сводки", async ({ page }) => {
  await loginAs(page, ACC.handler);
  const a = await (await page.request.get("/api/analytics")).json();
  expect(a.scope).toBe("own");
  expect(a.totals.total).toBeLessThan(20);
  expect((await page.request.get("/api/ai/digest")).status()).toBe(403);
  await page.goto("/analytics");
  await expect(page.getByText(/доступным вам/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Сводка для руководства" })).toHaveCount(0);
});
