// Lab 3 §5.3 / spec BR-40, BR-41 — LOCAL DEVELOPMENT CREDENTIALS ONLY, also
// documented in the README. They are not anyone's real password and must
// never be reused outside a local dev database.
//
// Kept in their own module (not seed.ts) so tests can import them without
// executing the seed script.

// "Initial password" accounts: must be changed at first login (the five
// requesters carried over from Lab 2 + one new requester).
export const SEED_INITIAL_PASSWORD = 'Welcome2026!'

// Ready-to-use accounts for demos and E2E tests.
export const SEED_DEMO_PASSWORD = 'TokTick2026!'
