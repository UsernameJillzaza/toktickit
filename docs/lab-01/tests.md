# Lab 1 — Test Manifest

All Lab 1 tests prove the initial TokTickIT vertical slice works. API tests live in `server/tests/lab-01/`; UI tests live in `client/tests/lab-01/`. Run them with `npm test` in `server/` and `client/`.

| Test ID | Test File | Tool | Test Description | Status |
| --- | --- | --- | --- | --- |
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns 200 and `{ status: "ok", service: "TokTickIT API" }` | ✅ Done (Issue #2) |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories | ✅ Done (Issue #4) |
| UI-01 | `client/tests/lab-01/App.test.tsx` | Vitest | TokTickIT heading renders | ✅ Done (Issue #4) |
| UI-02 | `client/tests/lab-01/App.test.tsx` | Vitest | Loading state changes to category list | ✅ Done (Issue #4) |
| UI-03 | `client/tests/lab-01/App.test.tsx` | Vitest | API failure displays a useful error message | ✅ Done (Issue #4) |

> Placeholder sanity tests from Issue #1 have been fully replaced by the real tests above. Client tests were relocated from `client/src/test/` to `client/tests/lab-01/` to match the labsheet's required structure (§14: "test files under `tests/lab-01/`").
