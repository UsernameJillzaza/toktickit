import { defineConfig } from '@playwright/test'

// Lab 2 §12: e2e/lab-02/. Assumes `server` (port 3000) and `client`
// (port 5173) are already running — see README for the two-terminal setup.
//
// `channel: 'msedge'` launches the system's installed Microsoft Edge
// instead of Playwright's own bundled Chromium — chosen specifically
// because `npx playwright install chromium` cannot download that binary in
// this environment (network restriction on the download host, confirmed
// against two mirrors). Using an already-installed browser sidesteps that
// entirely; no download needed.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
  },
})
