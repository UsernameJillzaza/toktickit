# Lab 4 Test Plan (Test DD / TDD)

Written before implementation and updated as tests are written (the `Final` column starts as `Pending` and is filled only from real runs). Requirements and AC are in [specification.md](specification.md); endpoints in [api-spec.md](api-spec.md); screens in [ui-spec.md](ui-spec.md). Lab 1–3 tests stay in place and run as regression.

## 1. Test Strategy

Spec first, then a failing test, then the code. Every AC in the specification maps to at least one test in Section 3.

| Type | Tool | Where |
| --- | --- | --- |
| Unit | Vitest | `server/tests/lab-04/*.unit.test.ts` |
| API / integration (incl. authorization, workflow, migration, performance-smoke) | Vitest + Supertest on the real PostgreSQL | `server/tests/lab-04/*.api.test.ts` |
| UI component, UI style, responsive units | Vitest + Testing Library | `client/tests/lab-04/*.test.tsx` |
| End-to-end and responsive evidence | Playwright (Edge) | `e2e/lab-04/*.spec.ts` |
| Regression | the unchanged Lab 1–3 suites | `server/tests/lab-0[123]`, `client/tests/lab-0[123]`, `e2e/lab-0[23]` |

Principles carried from Lab 3: each test creates and removes its own data (run-tagged users, `requestKey`s and tickets), so runs do not depend on, or change, the seed; authorization is tested **at the API**, never inferred from hidden controls; races (resolve against a concurrent action, double create) are forced deterministically, not left to luck; the dashboard tests compare every metric with a **direct database query**.

## 2. Planned Tests

`Final` is `Pending` until the test exists and passes in a real run.

### 2.1 Unit

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-04…BR-09 / AC-03 | field rules for an Action: description length, follow-up note required iff follow-up, limits, `actionAt` future tolerance, result/reason required | each violation names its field; valid input passes | `server/tests/lab-04/actions-validation.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-19, BR-20 / AC-17…AC-19 | the resolution/cancel gate decision from counts of Completed and Open Actions | allowed only with ≥ 1 Completed and 0 Open (resolve) or 0 Open (cancel); correct `reasons` | `server/tests/lab-04/resolution-gate.unit.test.ts` | Pending |
| UNIT-03 | Unit | BR-18 / AC-21 | the Lab 3 transition matrix is unchanged by Lab 4 (all 64 cells) | identical to the matrix in specification 5.4 | `server/tests/lab-03/status-transitions.unit.test.ts` (kept) | Pending |

### 2.2 API / integration

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | FR-01 / AC-01 | create a valid Action | `201`, under the right Ticket, creator and performer = signed-in user, `OPEN`, `version` 1 | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-02 | API | BR-16 / AC-02 | same `requestKey` twice | second answer `200` with the same record; one row | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-03 | API | BR-04…BR-07 / AC-03 | each invalid field combination | `400` with the field, nothing saved | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-04 | API | BR-02, BR-03 / AC-04 | performer inactive / Requester / unknown / another active staff or admin | `400 PERFORMER_INVALID` for the first three; accepted for the last | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-05 | API | FR-03, FR-06 / AC-05 | edit an Open Action with the current version, change the performer | `200`, fields changed, `version` + 1 | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-06 | API | BR-15 / AC-06 | edit, complete and cancel with an old `version` | `409 STALE_UPDATE`, nothing changed | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-07 | API | FR-04 / AC-07 | complete with and without a result | `200 COMPLETED` / `400` on `result` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-08 | API | FR-05 / AC-08 | cancel with and without a reason | `200 CANCELLED` / `400` on `result` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-09 | API | BR-10 / AC-09 | change a Completed or Cancelled Action; call `DELETE` | `409 ACTION_FINAL`; `DELETE` → `404` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-10 | API | BR-11 / AC-10 | create, edit, complete, cancel on a Resolved, Closed and Cancelled Ticket | `409 TICKET_NOT_WORKABLE` each time | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-11 | API | BR-12 / AC-11 | list Actions with different times and performers | stable `actionAt`, `id` order; performer names present; repeated calls identical | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-12 | API | BR-21 / AC-12 | list Actions of a Ticket with none (a pre-migration ticket) | `[]`, Ticket otherwise unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-13 | API | BR-16 / AC-02, AC-35 | two parallel creates with one `requestKey` | exactly one row; one `201`, one `200` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-14 | API | BR-17 / AC-01 | every successful Action change moves the Ticket's `updatedAt` | `updatedAt` increases | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-15 | API (authz) | 5.5 / AC-13 | Requester calls every staff Actions endpoint, even for their own Ticket | `403`, database unchanged | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-16 | API (authz) | BR-14 / AC-14 | Requester lists Actions on own, another's and a missing Ticket | all fields on own; `404` otherwise; staff roles `403` on that path | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-17 | API (authz) | AC-15 | signed out; user with `mustChangePassword` | `401`; `403 PASSWORD_CHANGE_REQUIRED` on every new endpoint | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-18 | API (authz) | AC-16 | Requester Actions response and dashboard | no Internal Note text, no IT Priority | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-19 | API (authz) | 5.5 / AC-29 | each dashboard endpoint for every role and signed out | `200` for the right role, `403` for the wrong one, `401` signed out | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-20 | API (workflow) | BR-19 / AC-17 | resolve with ≥ 1 Completed and 0 Open | `200 RESOLVED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-21 | API (workflow) | BR-19 / AC-18 | resolve with no Completed, with an Open, and with both problems — by direct API call | `409 RESOLUTION_BLOCKED` with the right `reasons`; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-22 | API (workflow) | BR-20 / AC-19 | cancel with and without an Open Action | `409 RESOLUTION_BLOCKED` / `200 CANCELLED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-23 | API (workflow) | BR-22 / AC-20 | Requester presses "Problem Appears Resolved" | status unchanged; the gate still applies | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-24 | API (workflow) | BR-18 / AC-21 | transitions outside the matrix; `allowedTransitions` for each status | `409 INVALID_TRANSITION`; the list equals the matrix | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-25 | API (workflow) | BR-23 / AC-22 | status change with an old, missing and malformed `expectedUpdatedAt` | `409 STALE_UPDATE` / `400`; status unchanged; owner and priority accept it optionally | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-26 | API (workflow) | BR-21 / AC-23 | a pre-Lab-4 Resolved Ticket with no Actions → Closed and → Reopened | both `200` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-27 | API (workflow) | BR-24, D-09 / AC-10, AC-18 | a resolve and an Action create sent at the same moment (row lock; the overlap is forced, like Lab 3's API-38) | never a Resolved Ticket with an Open Action; the loser gets `409` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-28 | API (workflow) | FR-08 / AC-24 | staff detail returns `actionCounts` and `resolution` consistent with the gate | hint equals what the status endpoint then does | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-29 | API (dashboard) | BR-28 / AC-25 | Requester dashboard with two Requesters' tickets | only own Tickets; no `itPriority` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-30 | API (dashboard) | BR-26 / AC-26 | `open`, `waitingForYou`, `resolvedLast30Days` and the two lists against direct queries (including a ticket just inside and just outside the 30-day window) | equal | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-31 | API (dashboard) | BR-29 / AC-28 | a Requester with no Tickets | counts `0`, lists `[]` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-32 | API (dashboard) | BR-25 / AC-26, AC-27 | metrics reflect writes made after the previous call (no stale cache): change an owner, a status and create an Action, then request again | counts and lists change accordingly | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-33 | API (dashboard) | BR-26 / AC-27 | every staff metric and list against direct queries on seeded data | equal | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-34 | API (dashboard) | BR-29 / AC-28 | staff dashboard with nothing matching (fresh user, no actions) | counts `0` (all keys present), lists `[]` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-35 | API (dashboard) | BR-31 / AC-30 | `users` for an Administrator and not for IT Staff | present / absent, counts equal a direct query | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-36 | API | AC-32 | My Tickets `status` (open, resolved, each status) and `updatedWithinDays`; unknown values; combined with search and category | correct subsets; `400` on bad values | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-37 | API | AC-32 | queue `requesterResolved=true`; other values | correct subset (default `active` still applies); `400` on other values | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-38 | API (dashboard) | BR-30 / AC-31 | for every card, the count equals `total` of the drill-down list request | equal for all cards | `server/tests/lab-04/staff-dashboard.api.test.ts` and `requester-dashboard.api.test.ts` | Pending |
| PERF-01 | Performance-smoke | D-14 / AC-27, AC-25 | both dashboards and the Actions list on the seeded data, five calls each | the median of each is under 1500 ms | `server/tests/lab-04/performance-smoke.api.test.ts` | Pending |

### 2.3 Migration and seed

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-37 | `add_actions_taken` applied on a database with Lab 3 data | row counts of every earlier table unchanged; the new table and enum exist (the drift check itself is a command, recorded in Section 6) | `server/tests/lab-04/migration.api.test.ts` | Pending |
| MIG-02 | Migration | BR-06, BR-16 / AC-02, AC-03 | the database itself rejects a follow-up note without follow-up, and a duplicate (`ticketId`, `requestKey`) | constraint errors | `server/tests/lab-04/migration.api.test.ts` | Pending |
| MIG-03 | Migration / seed | AC-38 | run the seed repeatedly | no duplicates; Tickets with 0, 1 and several Actions exist; data for zero and non-zero metrics | `server/tests/lab-04/migration.api.test.ts` | Pending |
| MIG-04 | Migration | BR-21 / AC-12 | Tickets that existed before the migration | listed and usable with zero Actions | `server/tests/lab-04/migration.api.test.ts` | Pending |

### 2.4 UI components and style

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | FR-02 / AC-11, AC-12 | Actions list: loaded, empty, loading, failure with Retry | each state; order as returned | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-02 | UI | BR-04, BR-06 / AC-03, AC-36 | create form validation; follow-up note appears and becomes required; message under the field, focus on the first invalid field; values survive a failure | as described, no request for empty required fields | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-03 | UI | BR-32 / AC-35 | double click on Save | one request; button disabled and "Saving…" | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-04 | UI | BR-03 / AC-04 | performer select lists active staff; `PERFORMER_INVALID` shows under it | as described | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-05 | UI | FR-03…FR-05 / AC-05, 07, 08, 09 | edit, Complete and Cancel panels; Completed and Cancelled show no buttons | requests carry `version`; read-only after | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-06 | UI | BR-15 / AC-06, AC-36 | `STALE_UPDATE` on edit | banner with Reload; typed text kept until Reload | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-07 | UI | BR-11 / AC-10 | `workable: false` | "New action" disabled with the visible reason | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-08 | UI | FR-07 / AC-14, AC-16 | Requester Ticket Detail Actions region | read-only, all fields, no buttons, no Internal Notes | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-09 | UI | FR-08 / AC-21, AC-24 | status options come from `allowedTransitions`; resolution hint | as returned by the API | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-10 | UI | FR-09 / AC-18, AC-24 | `RESOLUTION_BLOCKED` | reasons next to the control; choice kept | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-11 | UI | BR-23 / AC-22 | `STALE_UPDATE` on a status change | message with Reload; request carried `expectedUpdatedAt` | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-12 | UI | AC-24 | successful status change | summary status, options and hint refresh | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-13 | UI | FR-12, FR-13 / AC-27, AC-31 | staff dashboard cards, panels, lists and links | values and destinations as in ui-spec 4.3 | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-14 | UI | BR-29 / AC-28 | all-zero response | zero cards and empty-list messages | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-15 | UI | AC-33 | loading, `500` with Retry, `403` Forbidden | each state; Retry refetches | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-16 | UI | BR-31 / AC-30 | `users` card | shown only when the response contains `users` | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-17 | UI | FR-11, FR-13 / AC-25, AC-31 | Requester dashboard cards, lists, links | values and destinations as in ui-spec 4.2 | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-18 | UI | BR-29 / AC-28 | zero/empty Requester dashboard | zero cards and messages | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-19 | UI | AC-33 | loading and failure with Retry | each state | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-20 | UI | FR-14 / AC-34 | navigation for each role; `/` redirect | "Dashboard" first and active; lands on `/dashboard` | `client/tests/lab-04/Navigation.test.tsx` | Pending |
| UI-21 | UI | AC-32 | My Tickets reads `status` and `updatedWithinDays` from the URL; chip removable | request carries them; chip shown | `client/tests/lab-04/DrillDown.test.tsx` | Pending |
| UI-22 | UI | AC-32 | queue reads `requesterResolved` | request carries it; chip shown | `client/tests/lab-04/DrillDown.test.tsx` | Pending |
| STYLE-01 | UI style | AC-40 | Action status and follow-up badges | text present, class `tt-badge-action-<VALUE>`, symbol + text | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| STYLE-02 | UI style | AC-40 | the new controls keep the visible focus style | no `outline: none` on them; focusable by keyboard | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |

### 2.5 End-to-end, responsive and regression

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, 05, 07, 08, 11, 14 | two staff create different Actions on one Ticket, edit, complete, cancel; the Requester sees them read-only | as in the AC; screenshots in `actions-taken/` | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-17, 18, 20, 22, 24 | resolve is blocked, then allowed after completing; a stale screen is refused; the Requester's "appears resolved" does not resolve | as in the AC | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-03 | E2E | AC-25…AC-34 | Requester, IT Staff and Administrator dashboards; drill-down counts equal the lists; zero/empty states; navigation | as in the AC; screenshots in `staff-dashboard/` and `requester-dashboard/` | `e2e/lab-04/dashboards.spec.ts` | Pending |
| E2E-04 | E2E | BR-36 / AC-41 | walk every navigation page for each role and record console errors, failed requests and `404` links | none | `e2e/lab-04/hardening.spec.ts` | Pending |
| RESP-01 | Responsive | AC-40 | the Dashboards and the Ticket Detail screens at 1280 / 820 / 375 px: no horizontal overflow; every visible button ≥ 44 px on mobile; keyboard focus visible on the new forms | asserted, with screenshots | `e2e/lab-04/responsive-evidence.spec.ts` | Pending |
| REG-01 | Regression | AC-39 | the Lab 1–3 server suites | all pass (Lab 3 tests that call the status endpoint are updated for `expectedUpdatedAt`; their assertions are kept) | `server/tests/lab-01`, `lab-02`, `lab-03` | Pending |
| REG-02 | Regression | AC-39 | the Lab 1–3 client suites | all pass | `client/tests/lab-01`, `lab-02`, `lab-03` | Pending |
| REG-03 | Regression | AC-39 | the Lab 2 requester flow and the Lab 3 E2E suite | all pass | `e2e/lab-02/requester-ticket-flow.spec.ts`, `e2e/lab-03/*.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Test IDs | AC | Test IDs |
| --- | --- | --- | --- |
| AC-01 | API-01, API-14, E2E-01 | AC-22 | API-25, UI-11, E2E-02 |
| AC-02 | API-02, API-13, MIG-02 | AC-23 | API-26 |
| AC-03 | UNIT-01, API-03, UI-02, MIG-02 | AC-24 | API-28, UI-09, UI-10, UI-12, E2E-02 |
| AC-04 | API-04, UI-04 | AC-25 | API-29, UI-17, PERF-01, E2E-03 |
| AC-05 | API-05, UI-05, E2E-01 | AC-26 | API-30, API-32 |
| AC-06 | API-06, UI-06 | AC-27 | API-32, API-33, UI-13, PERF-01 |
| AC-07 | API-07, UI-05, E2E-01 | AC-28 | API-31, API-34, UI-14, UI-18, E2E-03 |
| AC-08 | API-08, UI-05, E2E-01 | AC-29 | API-19 |
| AC-09 | API-09, UI-05 | AC-30 | API-35, UI-16 |
| AC-10 | API-10, API-27, UI-07 | AC-31 | API-38, UI-13, UI-17, E2E-03 |
| AC-11 | API-11, UI-01, E2E-01 | AC-32 | API-36, API-37, UI-21, UI-22 |
| AC-12 | API-12, MIG-04, UI-01 | AC-33 | UI-15, UI-19, E2E-03 |
| AC-13 | API-15 | AC-34 | UI-20, E2E-03 |
| AC-14 | API-16, UI-08, E2E-01 | AC-35 | API-13, UI-03 |
| AC-15 | API-17 | AC-36 | UI-02, UI-06 |
| AC-16 | API-18, UI-08 | AC-37 | MIG-01 |
| AC-17 | UNIT-02, API-20, E2E-02 | AC-38 | MIG-03 |
| AC-18 | UNIT-02, API-21, API-27, UI-10, E2E-02 | AC-39 | REG-01, REG-02, REG-03 |
| AC-19 | UNIT-02, API-22 | AC-40 | STYLE-01, STYLE-02, RESP-01 |
| AC-20 | API-23, E2E-02 | AC-41 | E2E-04 (console/links) and the README check recorded in Section 6 |
| AC-21 | UNIT-03, API-24, UI-09 | | |

## 4. Responsive and Visual Checklist

Uses [ui-spec.md](ui-spec.md) Section 11; each item is ticked there, with the test or screenshot that proves it, only after the real screens exist.

## 5. Test Commands

PowerShell (Windows):

```powershell
cd server; npx prisma migrate deploy; npx prisma db seed; npm test
cd ..\client; npm test
# E2E: Playwright starts the server and client if they are not running (webServer in playwright.config.ts)
cd ..; npx playwright test
```

## 6. Final Results

Pending: filled from real runs on `main` after the last merge (counts, commit hash, date and the commands), together with (a) the migration **drift check** — `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` run once against the migrated database, expected output "This is an empty migration" — and (b) the README clean-checkout check (setup, migrate, seed, test and demo steps followed exactly as written).

## 7. Known Limitations or Deferred Tests

- **Dashboard "resolved" time:** there is no resolved-at column, so `resolvedLast30Days` uses `updatedAt` (D-10). A later comment on a resolved Ticket keeps it in the window a little longer.
- **No file upload on an Action:** only free-text Attachment Notes (scope).
- **Performance-smoke is a guard, not a benchmark:** the median of five calls under 1500 ms on seeded data (D-14); it can still fail on a machine that is badly overloaded.
- **Card and list are evaluated at different moments:** the rolling 30-day window of "Resolved (last 30 days)" is computed once for the card and again when its drill-down list is requested, so a Ticket crossing the boundary in between can make them differ by one (AC-31 is tested with data well away from the boundary).
- Lab 3's recorded limitations (for example the Requester-visible `updatedAt` and the unprotected `lab3-staging`) still stand unless listed as fixed here later.
