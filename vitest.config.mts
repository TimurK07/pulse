import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  resolve: { alias: { "@": path.resolve(root, "src"), "server-only": path.resolve(root, "tests/unit/server-only-stub.ts") } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
