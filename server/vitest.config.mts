import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Lab 3 spec D-13: every API suite shares the one local database, and the
    // "last active Administrator" test temporarily deactivates other admins.
    // Running files one at a time keeps those suites from seeing each other's
    // half-finished state. The whole suite still finishes in seconds.
    fileParallelism: false,
  },
})
