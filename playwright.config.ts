import { defineConfig, devices } from "@playwright/test";

// Runs against the dev server with the mock API. Uses the installed Chrome,
// so no browser download is needed.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  // Two browsers at a time keeps memory use modest on a dev laptop.
  workers: 2,
  // The first page loads after the dev servers start can be slow while Vite prepares each app;
  // with three apps, the first tests in a run can take over a minute.
  timeout: 90_000,
  // The owner portal and admin are separate dev servers behind /owner and /admin; with two browsers
  // running, their pages can take over 10 seconds to open.
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // One address: players at /, the owner portal at /owner.
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 860 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: [
    {
      command: "pnpm --filter @courtflex/portal dev",
      url: "http://127.0.0.1:5173/owner/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @courtflex/admin dev",
      url: "http://127.0.0.1:5175/admin/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @courtflex/player dev",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
