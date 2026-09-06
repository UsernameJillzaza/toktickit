import { defineConfig } from '@playwright/test'

// Lab 2 §12: e2e/lab-02/. Assumes `server` (port 3000) and `client`
// (port 5173) are already running — see README for the two-terminal setup.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
  },
})
