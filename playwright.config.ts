import { defineConfig } from "@playwright/test";

export const E2E_PORT = 5174;
export const OL_STUB_PORT = 4998;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  use: { baseURL: `http://localhost:${E2E_PORT}` },
});
