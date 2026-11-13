import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: { baseURL: "http://127.0.0.1:3103", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { browserName: "firefox", viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 1440, height: 900 } } },
    ...([390, 412] as const).flatMap(width => (["chromium", "firefox", "webkit"] as const).map(browserName => ({
      name: `${browserName}-mobile-${width}`, testMatch: "public.spec.ts",
      use: { browserName, viewport: { width, height: width === 390 ? 844 : 915 } },
    }))),
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3103",
    url: "http://127.0.0.1:3103",
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1", NEXORA_E2E: "1",
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      PATH: [path.dirname(process.execPath), ...(process.platform === "win32" ? [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32")] : []), process.env.PATH].join(path.delimiter),
    },
  },
});
