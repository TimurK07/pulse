import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;
// Интеграционные тесты AI-конвейера: отдельная БД pulse_test и имитация Anthropic API
export default defineConfig({
  resolve: { alias: { "@": path.resolve(root, "src"), "server-only": path.resolve(root, "tests/unit/server-only-stub.ts") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/pulse_test?schema=public`,
      ANTHROPIC_API_KEY: "test-key-not-real",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4599",
      AI_DAILY_BUDGET_USD: "1",
      AI_USER_LIMIT_PER_10MIN: "50",
      AI_TIMEOUT_MS: "1500",
    },
  },
});
