# Lab 4 — Specification (Sprint 4: Actions Taken, Dashboards, Final Regression)

Status: approved by the student on 2026-11-01 (decisions in Section 11). Extends [Lab 2](../lab-02/specification.md) and [Lab 3](../lab-03/specification.md); every Lab 2/3 rule stays in force unless this document says otherwise (BR-37).

## 1. Sprint Goal

Finish the core TokTickIT workflow: IT Staff record the work they actually do as **Actions Taken** under each Ticket, the backend refuses to resolve a Ticket whose work is not finished, every role starts from a concise **Dashboard** that links into the detailed screens, and the whole product from Labs 1–3 is hardened and proven by regression tests.

## 2. Stakeholder Request Interpretation

The service desk wants to plan and track real work, not only talk on a Ticket. In my words: a Ticket gets a list of Actions Taken, each saying what was done, when, by whom, with what result and whether follow-up is needed. The primary Ticket Owner still coordinates the Ticket, but any active IT Staff member (or Administrator) may do and record an action. Requesters see the work but cannot change it, and their "problem appears resolved" flag remains only a hint: IT Staff must review the work and formally resolve the Ticket. Dashboards must be short summaries computed by the backend that open the existing detailed lists. Finally the product must feel like one application: consistent states and errors, no leftovers from earlier labs, no duplicate submissions.

## 3. Scope

**Included**
- Actions Taken: create, list, edit while open, complete, cancel, change performer; read-only list for the Requester
- Final Ticket status-transition matrix and the backend **resolution gate**
- Stale-update detection for Ticket status changes and Action edits; retry/duplicate protection
- Requester Dashboard and IT Staff/Administrator Dashboard (backend-computed metrics, lists, drill-down)
- Three small filter additions needed by drill-down (My Tickets `status` and `updatedWithinDays`, queue `requesterResolved`; Section 8)
- Migration without data loss, idempotent seed, final hardening, README

**Excluded** (handout §4.2, plus): SLA clocks and escalation, any notification service, inventory/cost/billing, multi-level approval, report builders, multi-tenant or production cloud operations, **file upload on an Action** (an Action only has free-text Attachment Notes), deleting an Action, editing a completed or cancelled Action, and any feature not listed here.

## 4. Functional Requirements

- **FR-01** IT Staff and Administrators create an Action Taken on a Ticket.
- **FR-02** The staff Ticket Detail lists the Ticket's Actions Taken in a stable order.
- **FR-03** An Action that is still Open can be edited.
- **FR-04** An Open Action can be completed; completing requires a Result.
- **FR-05** An Open Action can be cancelled; cancelling requires a reason.
- **FR-06** The performer of an Open Action can be changed to another active IT Staff member or Administrator.
- **FR-07** A Requester sees all Actions Taken on their own Tickets, read-only, on the Requester Ticket Detail.
- **FR-08** Ticket status changes follow the final transition matrix; the UI offers only permitted transitions.
- **FR-09** The backend enforces the resolution gate and the cancel gate even when the screen is bypassed.
- **FR-10** A stale Ticket status change or Action edit is detected and rejected without overwriting.
- **FR-11** A Requester Dashboard summarises only the signed-in Requester's Tickets.
- **FR-12** An IT Staff/Administrator Dashboard gives an operational starting point; the Administrator also sees user-account counts.
- **FR-13** Every dashboard card and list row opens a detailed view (queue, My Tickets or Ticket Detail) filtered to match.
- **FR-14** Every role lands on its Dashboard after sign-in; the navigation has an active "Dashboard" item.
- **FR-15** Repeated clicking or a network retry never creates a duplicate Action.
- **FR-16** All screens give consistent loading, validation, success, empty, forbidden, conflict, not-found and safe-failure feedback; entered data survives a recoverable failure.
- **FR-17** The seed provides Tickets with zero, one and many Actions and enough data for zero and non-zero dashboard metrics.
- **FR-18** The README is current for setup, seed, migration, tests and demonstration.
- **FR-19** All Lab 1–3 behaviour keeps working (regression).

## 5. Business Rules

IDs restart at BR-01 for Lab 4 as the handout asks. "Lab 3 BR-nn" means a rule from [Lab 3](../lab-03/specification.md).

### 5.1 Actions Taken

- **BR-01** An Action Taken belongs to exactly one Ticket.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action may be performed and recorded by a different IT Staff member or Administrator. The Owner is not required to create actions.
- **BR-03** `performedBy` is filled automatically with the signed-in user when the Action is created. While the Action is Open it may be changed to another **active** IT Staff member or Administrator; an inactive or other-role user is rejected (`PERFORMER_INVALID`). `createdBy` never changes.
- **BR-04** `description` is required, trimmed, 1–2000 characters. Limits in this document count **characters** (an emoji is one); Lab 3's comment and note bodies keep counting UTF-16 units, a recorded Lab 3 limitation.
- **BR-05** `actionAt` defaults to the server's current time and may be set to a past time; it may not be more than 5 minutes in the future (clock-skew tolerance).
- **BR-06** `followUpRequired` is `false` by default. When it is `true`, `followUpNote` is required (1–1000 characters, trimmed). When it is `false`, `followUpNote` must be absent or empty (stored as `null`).
- **BR-07** `attachmentNotes` is optional free text, at most 500 characters, saying which file or image to look for. No file is uploaded.
- **BR-08** Action status is `OPEN`, `COMPLETED` or `CANCELLED`. A new Action is `OPEN`. Allowed moves: `OPEN → COMPLETED` and `OPEN → CANCELLED`; nothing else.
- **BR-09** Completing needs `result` (1–2000 characters). Cancelling needs a reason in `result` (1–2000 characters). While `OPEN`, `result` may be empty.
- **BR-10** `COMPLETED` and `CANCELLED` Actions are read-only. There is no delete operation anywhere, so the list of Actions on a Ticket only ever grows (append-only record of work).
- **BR-11** Actions can be created, edited, completed or cancelled only while the Ticket is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER` or `REOPENED`. On a `RESOLVED`, `CLOSED` or `CANCELLED` Ticket the answer is `409 TICKET_NOT_WORKABLE`. (Reopen a Resolved Ticket first.)
- **BR-12** Actions are listed by `actionAt` ascending, then `id` ascending, so the order is stable.
- **BR-13** All Action text is plain text, shown escaped, never as HTML.
- **BR-14** A Requester sees every field of every Action on their own Ticket, read-only. Another Requester's Ticket gives `404`, the same as a missing Ticket. Internal Notes are never part of Actions Taken or their endpoints.
- **BR-15** Every Action has an integer `version`, starting at 1 and increased by every successful change. Edit, complete and cancel must send the version they saw; a different current version gives `409 STALE_UPDATE` and changes nothing.
- **BR-16** Creating an Action carries a client-generated `requestKey` (1–64 characters). The pair (Ticket, `requestKey`) is unique. A repeated request with the same key returns the already-created Action with `200` and creates nothing new, whatever field *values* the repeated body carries. The repeat must still have the shape of a create request: an unknown field is a `400` even on a repeat, because shape is checked before anything is looked up.
- **BR-17** Every successful Action change moves the Ticket's `updatedAt` (Last Updated), as Lab 3 BR-26 does for comments and notes.

### 5.2 Ticket workflow and resolution

- **BR-18** The eight statuses are unchanged. The final transition matrix is in 5.4; only IT Staff and Administrators change status. Terminal statuses are `CLOSED` and `CANCELLED`.
- **BR-19** **Resolution gate.** Changing a Ticket to `RESOLVED` is allowed only if it has at least one `COMPLETED` Action **and** no `OPEN` Action. Otherwise `409 RESOLUTION_BLOCKED` with `reasons` listing `NO_COMPLETED_ACTION` and/or `OPEN_ACTIONS`.
- **BR-20** **Cancel gate.** Changing a Ticket to `CANCELLED` is allowed only if it has no `OPEN` Action; otherwise `409 RESOLUTION_BLOCKED` with reason `OPEN_ACTIONS`.
- **BR-21** Because of BR-11, BR-19 and BR-20, a `RESOLVED` Ticket created under Lab 4 rules never has an Open Action. Tickets that became `RESOLVED` under Lab 3 may have no Actions at all; the gate applies only to new transitions, so they can still be Closed or Reopened.
- **BR-22** The Requester's "Problem Appears Resolved" indication stays advisory (Lab 3 BR-25): it never changes status and never bypasses BR-19.
- **BR-23** Ticket status changes must send `expectedUpdatedAt`, the `updatedAt` the user saw. If the Ticket changed since, the answer is `409 STALE_UPDATE`. Owner and IT Priority changes accept the same field as optional; when sent it must match.
- **BR-24** The owner rule of Lab 3 BR-23 (Owner required for In Progress, Waiting for Requester, Resolved) still applies; the gate is checked together with it in one locked transaction, using the Ticket row lock that Lab 3's `mutateTicket` introduced.

### 5.3 Dashboards

- **BR-25** Every dashboard number and list is computed by the backend from the live database for each request; the client never counts rows itself. Endpoints return metrics and at most 5 list rows each, never whole Ticket collections.
- **BR-26** Definitions. **Active** = status not `CLOSED` and not `CANCELLED` (the Lab 3 queue default). **Open (Requester view)** = status not `RESOLVED`, `CLOSED` or `CANCELLED`.
  - Requester: `open` = own Tickets that are Open; `waitingForYou` = own Tickets in `WAITING_FOR_REQUESTER`; `resolvedLast30Days` = own Tickets in `RESOLVED` or `CLOSED` whose `updatedAt` is within the last 30 × 24 hours; `needsAttention` = own `WAITING_FOR_REQUESTER` Tickets, newest `updatedAt` first, at most 5; `recentlyUpdated` = own Tickets by `updatedAt` descending, at most 5.
  - IT Staff/Administrator: `unassigned` = Active Tickets with no owner; `myActive` = Active Tickets owned by the signed-in user; `requesterReportsResolved` = Active Tickets whose requester pressed "appears resolved"; `byStatus` = a count for each of the eight statuses over all Tickets; `byItPriority` = counts of Active Tickets per IT Priority; `urgent` = Active Tickets with IT Priority `CRITICAL`, newest `updatedAt` first, at most 5; `recentlyUpdated` = all Tickets by `updatedAt` descending, at most 5; `myRecentActions` = the last 5 Actions whose *performer* is the signed-in user (not the ones they only created for someone else), by `actionAt` descending.
  - Administrator only: `users` = total, active, inactive and count per role.
- **BR-27** Time windows are rolling (relative to the request time); the API returns timestamps in UTC and the UI shows them in the browser's local time. "30 days" means 30 × 24 hours, with no calendar-day boundary.
- **BR-28** A Requester sees only their own Tickets in every metric and list, and never an IT Priority. Role mismatch gives `403` before any query runs; a signed-out call gives `401`.
- **BR-29** Empty behaviour: a count with no matching Tickets is `0` (the card stays and shows 0); an empty list returns `[]` and the UI shows a short "nothing here" message. A failed dashboard request shows a safe error with a Retry, never a blank page.
- **BR-30** Drill-down. Every card and list row has a destination that reproduces the card's selection (Section 8, "Drill-down parameters"). Where a card counts all statuses of one kind the link carries the explicit status.
- **BR-31** The Administrator Dashboard is the IT Staff Dashboard plus the `users` card.

### 5.4 Final Ticket status-transition matrix

Rows are the current status, columns the new status. A cell marked Gate is allowed only if the gate of BR-19/20 passes. **Owner rule (BR-24), true for every cell that moves into `IN_PROGRESS`, `WAITING_FOR_REQUESTER` or `RESOLVED`:** the Ticket must have an owner, otherwise `409 OWNER_REQUIRED`; it is not repeated in the cells.

| From \ To | NEW | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NEW | — | ✅ | ✅ | — | — | — | — | ✅ Gate |
| OPEN | — | — | ✅ | ✅ | ✅ Gate | — | — | ✅ Gate |
| IN_PROGRESS | — | — | — | ✅ | ✅ Gate | — | — | ✅ Gate |
| WAITING_FOR_REQUESTER | — | — | ✅ | — | ✅ Gate | — | — | ✅ Gate |
| RESOLVED | — | — | — | — | — | ✅ | ✅ | — |
| CLOSED | — | — | — | — | — | — | — | — |
| REOPENED | — | — | ✅ | ✅ | ✅ Gate | — | — | ✅ Gate |
| CANCELLED | — | — | — | — | — | — | — | — |

Allowed roles for every change: IT Staff and Administrator. Requesters never change status. The cells are identical to Lab 3's matrix; Lab 4 adds only the gate conditions.

### 5.5 Authorization matrix (new operations)

| Operation | Signed out | REQUESTER | IT_STAFF | ADMIN |
| --- | --- | --- | --- | --- |
| List Actions on a staff Ticket (`/api/staff/tickets/:id/actions`) | 401 | 403 | ✅ | ✅ |
| Create / edit / complete / cancel an Action | 401 | 403 | ✅ | ✅ |
| List Actions on own Ticket (`/api/tickets/:id/actions`) | 401 | ✅ own; other's → 404 | 403 | 403 |
| Requester Dashboard | 401 | ✅ | 403 | 403 |
| IT Staff Dashboard | 401 | 403 | ✅ | ✅ (with `users`) |
| My Tickets `status`/`updatedWithinDays` filters (Requester) · queue `requesterResolved` filter (staff) | 401 | ✅ / 403 | 403 / ✅ | 403 / ✅ |
| Ticket status with gate and `expectedUpdatedAt` | 401 | 403 | ✅ | ✅ |

A user with `mustChangePassword` gets `403 PASSWORD_CHANGE_REQUIRED` on every row (Lab 3 BR-02). The role is checked before any lookup, so a `403` reveals nothing about whether a Ticket exists. Hiding a control in the UI is never the protection; every row above is tested directly on the API.

### 5.6 Hardening and compatibility

- **BR-32** Every write control is disabled while its request is in flight, and each create carries a `requestKey`, so a double click or a retry gives one record.
- **BR-33** After a recoverable failure (network error, `409`, validation error) the form keeps what the user typed and shows the message next to the control that caused it.
- **BR-34** Error responses keep the Lab 3 shape `{ "error", "code", "field"? }`; Lab 4 adds the codes in `api-spec.md`.
- **BR-35** Plain-text rendering, safe errors that never include stack traces or SQL, and the Lab 3 session/cookie rules are unchanged.
- **BR-36** No placeholder text, broken link, console error or unfinished control may remain on a screen reachable from the navigation; obsolete elements from earlier labs are removed.
- **BR-37** Rules not restated here keep their Lab 2/3 meaning, including ownership 404s, the owner rule, queue defaults and the password policy.

## 6. UI Specification Summary

Full detail in [ui-spec.md](ui-spec.md).

- **Dashboard** (`/dashboard`, one route; the content depends on the role): metric cards (label, value, "View" link) and short lists; loading skeleton, empty text, forbidden and safe-failure with Retry; cards reflow from four across to a single column on mobile.
- **Staff Ticket Detail** gets an **Actions Taken** area: a list in stable order with status badges, a "New action" form (create mode), and a view/edit mode per Open action with Complete and Cancel (each asks for its Result/reason). Follow-up note appears and becomes required when "Follow-up required" is checked. A resolution hint shows why Resolved is not available. The area says it is visible to the Requester and sits apart from Internal Notes.
- **Requester Ticket Detail** shows the same Actions Taken, read-only, in a section clearly separate from comments.
- **Navigation** gets "Dashboard" as the first item for every role; `/` redirects to it.
- Zen Green tokens, badges, spacing and the responsive/accessibility rules of Labs 2–3 are reused; Action status gets text-and-colour badges so status is never colour-only.

## 7. Data Changes

Prisma migration `add_actions_taken` is **create-only**: it adds one enum and one table and never alters or drops an existing column, so the no-data-loss promise of Labs 2 and 3 stays true.

- `enum ActionStatus { OPEN COMPLETED CANCELLED }`
- `model ActionTaken` (table `ActionTaken`): `id`, `ticketId` → Ticket (`ON DELETE RESTRICT`), `actionAt` (timestamp), `description`, `result` (nullable), `status` (default `OPEN`), `performedById` → User, `createdById` → User, `followUpRequired` (boolean, default false), `followUpNote` (nullable), `attachmentNotes` (nullable), `requestKey` (nullable), `version` (default 1), `createdAt`, `updatedAt`.
- Constraints and indexes: unique (`ticketId`, `requestKey`); index (`ticketId`, `actionAt`, `id`) for the list; index (`performedById`, `actionAt`) for "my recent actions"; index (`status`) for the gate's counts; a database `CHECK` that `followUpNote` is non-null only when `followUpRequired` is true.
- **Backfill:** none. Existing Tickets simply have zero Actions (BR-21); dashboards count Tickets, not Actions, so no dashboard number changes meaning for old data.
- **Rollback/recovery:** the migration only adds objects, so recovery is dropping the table and enum (`DROP TABLE "ActionTaken"; DROP TYPE "ActionStatus";`) and deleting its row from `_prisma_migrations`; a `pg_dump` is taken before applying on a real database. MIG tests apply the migration to a database that already holds Lab 3 data and check that row counts for every earlier table are unchanged.
- **Seed** (idempotent, keyed by ticket number and `requestKey`): Tickets in every status, assigned and unassigned, with 0, 1 and several Actions (Open, Completed with and without follow-up, Cancelled, performed by different staff), a Ticket where the Requester reported "appears resolved", and at least one Requester with no Tickets to show zero metrics.
- Two other database-design choices are recorded in Section 11 (D-04, D-05).

## 8. API Contract

Full detail in [api-spec.md](api-spec.md). Summary:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/staff/tickets/:id/actions` | list Actions (staff) |
| `POST /api/staff/tickets/:id/actions` | create (`requestKey`) → `201`, replay → `200` |
| `PATCH /api/staff/tickets/:id/actions/:actionId` | edit an Open Action (`version`) |
| `POST /api/staff/tickets/:id/actions/:actionId/complete` | complete (`version`, `result`) |
| `POST /api/staff/tickets/:id/actions/:actionId/cancel` | cancel (`version`, `result` = reason) |
| `GET /api/tickets/:id/actions` | list own Ticket's Actions (Requester) |
| `PUT /api/staff/tickets/:id/status` | now needs `expectedUpdatedAt`; adds `RESOLUTION_BLOCKED`, `STALE_UPDATE` |
| `GET /api/staff/tickets/:id` | now also returns `updatedAt`, `actionCounts`, `resolution` hint |
| `GET /api/dashboard/requester` | Requester metrics and lists |
| `GET /api/dashboard/staff` | IT Staff/Administrator metrics and lists |
| `GET /api/tickets?status=…&updatedWithinDays=…` | My Tickets gains two filters |
| `GET /api/staff/tickets?requesterResolved=true` | queue gains a filter |

**Drill-down parameters** (used by dashboard links)

| Card | Destination |
| --- | --- |
| Requester `open` | `/my-tickets?status=open` |
| Requester `waitingForYou`, `needsAttention` "view all" | `/my-tickets?status=WAITING_FOR_REQUESTER` |
| Requester `resolvedLast30Days` | `/my-tickets?status=resolved&updatedWithinDays=30` |
| Staff `unassigned` | `/staff/queue?owner=unassigned` |
| Staff `myActive` | `/staff/queue?owner=me` |
| Staff `requesterReportsResolved` | `/staff/queue?requesterResolved=true` |
| Staff `byStatus[S]` | `/staff/queue?status=S` |
| Staff `byItPriority[P]`, `urgent` "view all" | `/staff/queue?priority=P` (`CRITICAL` for urgent) |
| any list row | `/tickets/:id` (Requester) or `/staff/tickets/:id` |
| `myRecentActions` row | `/staff/tickets/:ticketId` |

Concurrency: BR-15, BR-16 and BR-23 give optimistic checks; the status change, and every Action write that depends on Ticket state, runs in one transaction that locks the Ticket row (`SELECT … FOR UPDATE`), as Lab 3 does, so two staff cannot both pass the gate against stale data.

## 9. Acceptance Criteria

Each AC maps to at least one planned test in [tests.md](tests.md) Section 3.

### Actions Taken
- **AC-01** Given a permitted IT Staff user and valid data, when an Action is created, it is saved under that Ticket with the signed-in user as creator and performer, status `OPEN`, `version` 1, and the Ticket's Last Updated moves.
- **AC-02** Given the same `requestKey` is sent twice, then only one Action exists and the second answer is `200` with the same record.
- **AC-03** Given an empty or over-long description, a follow-up required without a note, a note without follow-up, a result or attachment note over its limit, or an `actionAt` more than 5 minutes ahead, then the answer is `400` naming the field and nothing is saved.
- **AC-04** Given a performer who is inactive, a Requester or unknown, when an Action is created or its performer changed, then `400 PERFORMER_INVALID` and nothing changes; an active IT Staff member or Administrator is accepted (BR-02, BR-03).
- **AC-05** Given an Open Action, when it is edited with the current `version`, then the fields change, `version` increases by 1 and `performedBy` can be another active staff member.
- **AC-06** Given an edit, complete or cancel with an old `version`, then `409 STALE_UPDATE`, nothing is changed.
- **AC-07** Given an Open Action and a non-empty result, when it is completed, then its status is `COMPLETED`; completing without a result gives `400`.
- **AC-08** Given an Open Action and a reason, when it is cancelled, then its status is `CANCELLED`; cancelling without a reason gives `400`.
- **AC-09** Given a `COMPLETED` or `CANCELLED` Action, when any edit, complete or cancel is attempted, then `409 ACTION_FINAL`; there is no delete endpoint (`404`/`405`).
- **AC-10** Given a Ticket that is `RESOLVED`, `CLOSED` or `CANCELLED`, when an Action is created, edited, completed or cancelled, then `409 TICKET_NOT_WORKABLE`.
- **AC-11** Given several Actions with different times and performers on one Ticket, when they are listed, then they come in `actionAt`, `id` order with performer names, and the list is the same on every request.
- **AC-12** Given a Ticket with no Actions (including one that existed before the migration), when its Actions are listed, then the list is empty and the Ticket still works as before.

### Authorization
- **AC-13** Given a Requester, when any staff Actions endpoint is called, then `403`, and nothing is changed or revealed (even for their own Ticket).
- **AC-14** Given a Requester, when they list Actions on their own Ticket, then they get every Action with every field, read-only; on another Requester's Ticket or a missing id, `404`.
- **AC-15** Given a signed-out caller, then `401` on every new endpoint; a user who must change the password gets `403 PASSWORD_CHANGE_REQUIRED`.
- **AC-16** Given any Requester Actions response, then it contains no Internal Note content and no IT Priority.

### Ticket workflow and resolution
- **AC-17** Given a Ticket with at least one Completed and no Open Action, when staff change it to `RESOLVED` with the current `expectedUpdatedAt`, then it becomes `RESOLVED`.
- **AC-18** Given a Ticket with no Completed Action, or with an Open Action, when changed to `RESOLVED` (by direct API call, bypassing the screen), then `409 RESOLUTION_BLOCKED` with the matching `reasons`, and the status is unchanged.
- **AC-19** Given a Ticket with an Open Action, when changed to `CANCELLED`, then `409 RESOLUTION_BLOCKED` (`OPEN_ACTIONS`); with no Open Action it succeeds.
- **AC-20** Given a Requester who pressed "Problem Appears Resolved", then the Ticket status is unchanged and the gate still applies.
- **AC-21** Given a transition outside the matrix in 5.4, then `409 INVALID_TRANSITION`; the allowed transitions returned to the UI equal the matrix.
- **AC-22** Given a status change sent with an old `expectedUpdatedAt`, or without one, then `409 STALE_UPDATE` / `400` and the status is unchanged.
- **AC-23** Given a `RESOLVED` Ticket that was resolved before Lab 4 and has no Actions, then it can still be moved to `CLOSED` or `REOPENED`.
- **AC-24** Given a successful status change, then the screen's Ticket summary shows the new status without a manual reload, and a blocked change shows the reason next to the control.

### Dashboards
- **AC-25** Given a Requester, when the Requester dashboard is requested, then only that Requester's Tickets are counted and listed, and no IT Priority is returned.
- **AC-26** Given seeded data, then each Requester metric equals a direct database query for that user: `open`, `waitingForYou`, `resolvedLast30Days` (BR-26).
- **AC-27** Given seeded data, then each IT Staff metric equals a direct database query: `unassigned`, `myActive`, `requesterReportsResolved`, `byStatus`, `byItPriority`, `urgent`, `recentlyUpdated`, `myRecentActions`.
- **AC-28** Given a user with no matching Tickets, then every count is `0` and every list is `[]`, and the screen shows the zero values and the empty messages.
- **AC-29** Given a Requester calling the staff dashboard (or the reverse), then `403`; signed out `401`.
- **AC-30** Given an Administrator, then the staff dashboard also includes `users`; for IT Staff it does not.
- **AC-31** Given any dashboard card or list row, when it is activated, then it opens the destination in 5.3/Section 8 and the opened list matches the card's count.
- **AC-32** Given the My Tickets `status` and `updatedWithinDays` filters and the queue `requesterResolved` filter, then they return exactly the Tickets the drill-down needs, reject unknown values with `400`, and leave all Lab 2/3 filters working.
- **AC-33** Given a failed dashboard request or a slow one, then the screen shows a loading state, then a safe error with Retry, never a blank page.
- **AC-34** Given each role signing in, then it lands on its Dashboard, the navigation has an active "Dashboard" item, and `/` redirects there.

### Hardening and regression
- **AC-35** Given a double click or a retry after a network failure, then one Action exists and the control was disabled while the request ran.
- **AC-36** Given a recoverable failure on the Action form, then the typed values are still there and the message is next to the field or control concerned.
- **AC-37** Given the migration applied to a database holding Lab 3 data, then every earlier table keeps its row count, and the drift check (`prisma migrate diff`, run by command and recorded in `tests.md`) is empty.
- **AC-38** Given the seed run repeatedly, then no duplicates appear and the data covers zero, one and many Actions.
- **AC-39** Given a Lab 1–3 regression run, then all earlier suites still pass (REG-01…REG-03), including Requester ticket flow, queue, comments and notes, and user management.
- **AC-40** Given the new screens at desktop, tablet and mobile widths, then there is no horizontal overflow, buttons are at least 44 px tall on mobile, status is conveyed by text as well as colour, and keyboard focus is visible on the new controls.
- **AC-41** Given the finished application, then the browser console shows no errors on any navigation page and the README steps work from a clean checkout.

## 10. Definition of Done (Product)

- [x] Every FR, BR and AC above is implemented, and each AC has a passing automated test listed in `tests.md` (traceability table, `tests.md` §3; all 76 planned tests pass, §6)
- [x] All new endpoints enforce authorization on the backend; each row of 5.5 is tested at the API (API-15 … API-19)
- [x] Resolution and cancel gates tested by direct API calls, not only through the UI (API-20 … API-28)
- [x] Migration applied to a Lab 3 database without data loss; drift check empty; seed idempotent (MIG-01 … MIG-04; drift check in `tests.md` §6; row counts in PR #72)
- [x] Dashboard numbers match direct database queries (API-30, API-33, E2E-03 and `staff-dashboard/metric-vs-database.png`)
- [ ] Server, client and E2E suites pass on `main`; the Lab 1–3 suites still pass
- [x] Zen Green consistency, responsive and accessibility checklist in `ui-spec.md` completed with evidence for each item (§11)
- [x] No console errors, broken links, placeholders or unfinished controls (E2E-04)
- [ ] README current; `.env` never committed
- [ ] Every PR reviewed and approved by the peer reviewer before merge; Issues closed and the board in its final column
- [ ] `tests.md`, `reviewer.md` and `ai-use.md` are filled from real results; screenshots in `artifacts/lab-04/screenshots/`

## 11. Assumptions and Decisions

The handout leaves several things open or contradicts itself. These are my decisions, made with the AI specification agent and approved by me.

| ID | Decision | Reason |
| --- | --- | --- |
| D-01 | An Action Taken has the fields in BR-03 … BR-07, plus a status (`OPEN`, `COMPLETED`, `CANCELLED`), `version` and `requestKey`. | The field list in handout §3/§8.3 has no assignee or status, but AC-01 mentions an "approved assignee" and Part 6 asks for assign, complete, cancel and inactive-assignee rejection. The superset satisfies both readings. |
| D-02 | "Performed by (auto)" means the signed-in creator by default; "assign" means choosing another active staff member as performer while the Action is Open. | Gives the assignee behaviour without a second "assignee" concept. |
| D-03 | Completed and cancelled Actions are final and nothing is ever deleted ("append-only"); only Open Actions are edited. | Part 7 asks for append-only behaviour while §1 says create and update; edits-while-open reconciles both and keeps an honest record of work. |
| D-04 | Database: `version` integer for optimistic checks (instead of timestamps) and a unique (`ticketId`, `requestKey`) pair for retry safety. | Timestamps can collide within a millisecond; a counter cannot. A unique key makes retry safety a database guarantee, not a UI hope. |
| D-05 | Database: a `CHECK` ties `followUpNote` to `followUpRequired`, and two composite indexes serve the list and "my recent actions". | The rule holds even if a future code path forgets to validate; the indexes keep the Ticket Detail and dashboard queries cheap. |
| D-06 | Resolution rule: at least one Completed and no Open Action; cancel needs no Open Action (BR-19, BR-20). | The handout requires a backend-enforced "resolution rule" but never states it; this is the smallest rule that makes "IT Staff must review the work" checkable. |
| D-07 | Actions can only change while the Ticket is workable (BR-11), which keeps "Resolved ⇒ no Open Action" true. | Without it a Resolved Ticket could gain an Open Action and the gate would mean nothing. |
| D-08 | Actions Taken are visible to the Requester (handout §8.3), so staff are told on screen that the Action text is visible; confidential material goes in Internal Notes. | §4.3 says "where approved by the specification"; §8.3 says Requesters see all. This spec approves it. |
| D-09 | Stale handling: `expectedUpdatedAt` for Ticket status changes (required), `version` for Actions. Any Action write moves the Ticket's Last Updated, so a status change made from a stale screen is refused and the user reloads. | A status change depends on the Actions; this makes the gate impossible to pass against data the user has not seen. Public comments, Internal Notes and the Requester's "appears resolved" also move Last Updated (Lab 3 BR-26), so a status change from a screen loaded before any of them is refused too; the user reloads and tries again. That is deliberate and costs one reload. |
| D-10 | Dashboard metrics use rolling windows and `updatedAt` as the "resolved" time (there is no separate resolved-at column). A comment on a resolved Ticket therefore keeps it in "resolved last 30 days" a little longer. Documented as a known limitation in `tests.md`. | Adding a column would change earlier data semantics for little gain; the metric stays explainable and testable. |
| D-11 | "Urgent" means Active Tickets with IT Priority `CRITICAL`; HIGH is visible through the priority counts. | Keeps the list short and the drill-down a single existing query parameter. |
| D-12 | Three small filter additions (My Tickets `status` and `updatedWithinDays`, queue `requesterResolved`) are part of this sprint so every card has a working drill-down. | Handout §4.6 asks for a drill-down where practical; the existing endpoints cannot express these selections. |
| D-13 | `/dashboard` is one route and the content follows the role; every role lands there. | One route keeps navigation and the "Dashboard" active state simple. |
| D-14 | Performance-smoke: the **median of five calls** to each dashboard endpoint and to the Actions list must be under 1500 ms on the seeded data. | A smoke guard against an accidental N+1 query, not a benchmark; the median keeps one slow call on a busy machine from failing the run. |
| D-15 | Where this document is silent, the Lab 2/3 decisions (D-nn) stay in force. | Preserves earlier increments (BR-37). |

## 12. Issue Decomposition

Eight Issues, in this dependency order; the chain is linear so each PR builds on the last merged one.

| Issue | Content |
| --- | --- |
| L4-1 (#63) | This contract: `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` |
| L4-2 (#64) | Migration, model, seed, Actions API, authorization, stale and retry safety |
| L4-3 (#65) | Resolution and cancel gates, `expectedUpdatedAt`, final matrix, hint data |
| L4-4 (#66) | Actions Taken UI (staff and Requester), workflow feedback on Ticket Detail |
| L4-5 (#67) | Dashboard APIs, filter additions, DB-match tests |
| L4-6 (#68) | Dashboard screens, navigation, drill-down |
| L4-7 (#69) | Final hardening, E2E suite, screenshots, visual checklist |
| L4-8 (#70) | Final documentation: tests results, reviewer, AI use, README |
