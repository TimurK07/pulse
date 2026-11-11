import { defineConfig, devices } from "@playwright/test";

/**
 * E2E работают на production-сборке и отдельной БД pulse_test — рабочая демо-база
 * не затрагивается. Внешний AI в E2E выключен (AI_ENABLED=false): проверяются
 * детерминированные локальные алгоритмы, кредиты Anthropic не тратятся.
 * Битрикс24 в E2E тоже выключен (BITRIX24_ENABLED=false): тесты не пишут в рабочий чат.
 * Запуск: npm run test:e2e (подхватывает .env.local).
 */
const PORT = Number(process.env.E2E_PORT ?? 3218);
const baseDb = process.env.DATABASE_URL ?? "";
const TEST_DB = process.env.TEST_DATABASE_URL ?? baseDb.replace(/\/pulse(\?|$)/, "/pulse_test$1");
if (!TEST_DB.includes("pulse_test")) throw new Error("E2E должны работать на тестовой БД pulse_test");
process.env.TEST_DATABASE_URL = TEST_DB;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, locale: "ru-RU", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    // NEXT_DIST_DIR: production-сборка для E2E не перезаписывает .next работающего dev-сервера
    env: { DATABASE_URL: TEST_DB, AI_ENABLED: "false", DEMO_MODE: "true", CRON_SECRET: "e2e-cron-secret-0123456789", NEXT_DIST_DIR: ".next-e2e", BITRIX24_ENABLED: "false" },
  },
});
