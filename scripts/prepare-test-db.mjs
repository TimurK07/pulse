// Готовит отдельную БД для интеграционных тестов: миграции + демо-данные
import { execSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ?? "").replace(/\/pulse(\?|$)/, "/pulse_test$1");
if (!url.includes("pulse_test")) throw new Error("TEST_DATABASE_URL должен указывать на тестовую БД");
const env = { ...process.env, DATABASE_URL: url };
execSync("node node_modules/prisma/build/index.js migrate deploy", { env, stdio: ["ignore", "ignore", "inherit"] });
execSync("node node_modules/tsx/dist/cli.mjs prisma/seed.ts", { env, stdio: ["ignore", "ignore", "inherit"] });
console.log("pulse_test готова");
