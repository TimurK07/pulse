import { execSync } from "node:child_process";

// Тестовая БД пересоздаётся перед прогоном; рабочая демо-база не затрагивается
export default function prepare() {
  execSync("node scripts/prepare-test-db.mjs", { stdio: "inherit", env: process.env });
}
