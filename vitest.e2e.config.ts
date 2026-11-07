import { defineConfig } from "vitest/config";

/** Real-browser tests against the built single file (npm run test:e2e). Slower, needs an installed Chromium-based browser. */
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
