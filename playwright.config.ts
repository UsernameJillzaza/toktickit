import { defineConfig } from '@playwright/test'

// E2E suites: e2e/lab-02 (Lab 2 §12) and e2e/lab-03 (Lab 3 §12).
//
// `channel: 'msedge'` launches the system's installed Microsoft Edge
// instead of Playwright's own bundled Chromium — chosen specifically
// because `npx playwright install chromium` cannot download that binary in
// this environment (network restriction on the download host, confirmed
// against two mirrors). Using an already-installed browser sidesteps that
// entirely; no download needed.
//
// Lab 3: the two Lab 2 *evidence* specs are left out of the default run.
// They captured Lab 2 submission screenshots against Lab 2 behaviour (the
// Development Requester selector, requesterId URLs) that Lab 3 removed on
// purpose, and github-evidence browses github.com. To regenerate Lab 2
// evidence, check out the Lab 2 release commit and run them there with
// LAB2_EVIDENCE=1. The Lab 2 requester flow itself still runs (REG-03).
export default defineConfig({
  testDir: './e2e',
  testIgnore: process.env.LAB2_EVIDENCE
    ? []
    : ['**/lab-02/submission-evidence.spec.ts', '**/lab-02/github-evidence.spec.ts'],
  fullyParallel: false,
  // One worker: the suites share one local database and the seeded admin.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
  },
  // Starts the API and the Vite dev server when they aren't already running
  // (reuses them when they are, e.g. two terminals per the README).
  webServer: [
    { command: 'npm --prefix server run dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm --prefix client run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
})
