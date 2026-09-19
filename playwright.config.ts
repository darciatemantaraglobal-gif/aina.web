import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // This repo's @playwright/test version defaults to a
        // chrome-headless-shell revision that isn't pre-installed in this
        // environment (only plain Chromium is, at /opt/pw-browsers/chromium)
        // — pin it explicitly instead of trying to download a new browser.
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
  // Boots the real dev stack (Vite + Express, matching `npm run dev`) so
  // `npx playwright test` works standalone — no env vars required for the
  // unauthenticated smoke tests in tests/smoke.spec.ts, since the app is
  // designed to degrade gracefully without Supabase/OpenRouter configured.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
