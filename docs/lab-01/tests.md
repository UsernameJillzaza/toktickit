# Lab 1 — Test Manifest

All Lab 1 tests prove the initial TokTickIT vertical slice works. API tests live in `server/tests/lab-01/`; UI tests live in the client package. Run them with `npm test` in `server/` and `client/`.

| Test ID | Test File | Tool | Test Description | Status |
| --- | --- | --- | --- | --- |
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns 200 and `{ status: "ok", service: "TokTickIT API" }` | Planned (Issue #2) |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories | Planned (Issue #4) |
| UI-01 | `client/…` | Vitest | TokTickIT heading renders | Planned (Issue #4) |
| UI-02 | `client/…` | Vitest | Loading state changes to category list | Planned (Issue #4) |
| UI-03 | `client/…` | Vitest | API failure displays a useful error message | Planned (Issue #4) |

> **Issue #1 (foundation)** ships placeholder tests that prove the runners are configured: `server/tests/lab-01/sanity.test.ts` (Supertest + Vitest) and `client/src/test/sanity.test.ts` (Vitest). These are replaced by the real tests above in Issues #2 and #4.
