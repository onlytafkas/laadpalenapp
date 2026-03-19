import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    globals: true,
    // Run all integration test files in a single process so they share the
    // same pg-mem singleton (module cache) and backup/restore cleanly.
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
