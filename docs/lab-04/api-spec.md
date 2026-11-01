# Lab 4 REST API Contract

Extends [Lab 3's contract](../lab-03/api-spec.md). Every Lab 2/3 endpoint stays at its path with the behaviour it had, except the changes listed under "Changed endpoints". Rules referenced as BR-nn / AC-nn are in [specification.md](specification.md).

## Conventions (unchanged from Lab 3)

- Session cookie `tt_session`, same-origin through the Vite proxy; all bodies are JSON; times are ISO-8601 UTC strings.
- Error shape everywhere: `{ "error": string, "code"?: string, "field"?: string }`. Lab 4 adds optional `reasons` (array of strings) to `RESOLUTION_BLOCKED` only.
- Order of checks on every new endpoint: **authenticate → password-change gate → role (403) → input shape (400) → resource lookup (404) → state and concurrency rules (409) → field rules (400)**. The role check comes before any lookup, so a `403` never reveals whether a Ticket exists.
- Unparseable JSON is `400 VALIDATION_ERROR`, never `500`.

### New error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` (+ `field`) | a field is missing, empty, too long, of the wrong type, or breaks BR-04 … BR-07, BR-09 |
| 400 | `PERFORMER_INVALID` (`field: performedById`) | not an active IT Staff member or Administrator (BR-03) |
| 409 | `TICKET_NOT_WORKABLE` | the Ticket is `RESOLVED`, `CLOSED` or `CANCELLED` (BR-11) |
| 409 | `ACTION_FINAL` | the Action is `COMPLETED` or `CANCELLED` (BR-10) |
| 409 | `STALE_UPDATE` | `version` or `expectedUpdatedAt` is not current (BR-15, BR-23) |
| 409 | `RESOLUTION_BLOCKED` (+ `reasons`) | the resolution or cancel gate failed (BR-19, BR-20) |

## The Action Taken object

```json
{
  "id": 41, "ticketId": 12,
  "actionAt": "2026-11-01T08:30:00.000Z",
  "description": "Replaced the HDMI switcher in room 401",
  "result": null,
  "status": "OPEN",
  "followUpRequired": true,
  "followUpNote": "Check the projector again on Monday",
  "attachmentNotes": "Photo of the new switcher is on the shared drive, folder 401",
  "version": 1,
  "performedBy": { "id": 8, "name": "Krit Staff", "role": "IT_STAFF" },
  "createdBy": { "id": 8, "name": "Krit Staff" },
  "createdAt": "…", "updatedAt": "…"
}
```

`result` is `null` until the Action is completed or cancelled (it may hold a draft while Open). `followUpNote` is `null` when `followUpRequired` is `false`. The Requester endpoint returns exactly the same object (no email addresses are included for either role).

## Actions Taken — IT Staff / Administrator

### `GET /api/staff/tickets/:id/actions`

Response `200`:

```json
{ "ticketStatus": "IN_PROGRESS", "workable": true, "actions": [ { …Action… } ] }
```

Ordered by `actionAt` ascending, then `id` ascending (BR-12); `[]` when the Ticket has none. `workable` is `true` when the Ticket status allows changes (BR-11), so the UI can disable the create control. `404 NOT_FOUND` for a missing Ticket.

### `POST /api/staff/tickets/:id/actions`

Request:

```json
{
  "requestKey": "b7e0c2a4-…",
  "description": "Replaced the HDMI switcher in room 401",
  "actionAt": "2026-11-01T08:30:00.000Z",
  "performedById": 8,
  "followUpRequired": true,
  "followUpNote": "Check again on Monday",
  "attachmentNotes": "Photo is in folder 401"
}
```

Required: `requestKey` (1–64 chars), `description`. Optional: `actionAt` (default: now), `performedById` (default: the signed-in user), `followUpRequired` (default `false`), `followUpNote`, `attachmentNotes`. `status` is always `OPEN`, `version` 1; the client cannot set them.

| Status | Body | When |
| --- | --- | --- |
| 201 | Action | created (Ticket's Last Updated moves, BR-17) |
| 200 | Action | the same `requestKey` was already used on this Ticket: the existing Action is returned and nothing is created; the field *values* of the repeat are ignored, but its shape is still checked, so an unknown field is a `400` (BR-16) |
| 400 | `VALIDATION_ERROR` + `field` | missing/invalid fields; `description` empty or over 2000; `followUpRequired` true without `followUpNote`, or a note while false; note over 1000; `attachmentNotes` over 500; `actionAt` more than 5 minutes in the future or not a date; any field not listed above (`status`, `version` and `id` included) |
| 400 | `PERFORMER_INVALID` | `performedById` is not an active IT Staff member or Administrator |
| 401 / 403 | — | signed out / Requester |
| 404 | `NOT_FOUND` | no such Ticket |
| 409 | `TICKET_NOT_WORKABLE` | the Ticket is Resolved, Closed or Cancelled |

The replay check runs right after the `404`, before the workable and field rules, so a retry always gets its original answer.

### `PATCH /api/staff/tickets/:id/actions/:actionId`

Edits an **Open** Action. Request: `version` (required, the number the user saw) plus any of `description`, `actionAt`, `performedById`, `followUpRequired`, `followUpNote`, `attachmentNotes`, `result` (a draft). Fields not sent are unchanged; the follow-up rule (BR-06) is checked on the merged result.

| Status | Body | When |
| --- | --- | --- |
| 200 | Action | updated, `version` + 1, Ticket's Last Updated moves |
| 400 | `VALIDATION_ERROR` / `PERFORMER_INVALID` | as for create; `version` missing or not an integer; an unknown field; no field to change at all (`field: body`, "Send at least one field to change.") |
| 404 | `NOT_FOUND` | no such Ticket, or the Action does not belong to this Ticket |
| 409 | `ACTION_FINAL` | the Action is Completed or Cancelled |
| 409 | `TICKET_NOT_WORKABLE` | the Ticket is Resolved, Closed or Cancelled |
| 409 | `STALE_UPDATE` | `version` is not the current version; nothing changes |

### `POST /api/staff/tickets/:id/actions/:actionId/complete`

Request: `{ "version": 3, "result": "Switcher replaced, projector shows the picture" }`. `result` is required (1–2000 characters, trimmed).

`200` Action (`status: COMPLETED`, `version` + 1) · `400 VALIDATION_ERROR` field `result` or `version` · `404` · `409 ACTION_FINAL` · `409 TICKET_NOT_WORKABLE` · `409 STALE_UPDATE`.

### `POST /api/staff/tickets/:id/actions/:actionId/cancel`

Request: `{ "version": 3, "result": "Switcher turned out to be fine, nothing to replace" }` — `result` holds the reason (required, 1–2000 characters).

`200` Action (`status: CANCELLED`, `version` + 1) · same errors as complete.

There is **no** `DELETE` endpoint; `DELETE /api/staff/tickets/:id/actions/:actionId` answers `404 NOT_FOUND` like any unknown route (BR-10).

## Actions Taken — Requester

### `GET /api/tickets/:id/actions`

Response `200`: `{ "actions": [ { …Action… } ] }`, same order and shape as the staff list, read-only. `404 NOT_FOUND` for a missing Ticket **or another Requester's Ticket**; `403` for IT Staff and Administrators (they use the staff endpoint); `401` signed out. Internal Notes are not part of this response (BR-14).

## Changed endpoints

### `GET /api/staff/tickets/:id` (Staff Ticket Detail)

Gains three fields (everything else as in Lab 3; `updatedAt` was already returned):

```json
{
  "actionCounts": { "open": 1, "completed": 2, "cancelled": 0 },
  "resolution": { "canResolve": false, "canCancel": false, "reasons": ["OPEN_ACTIONS"] },
  "allowedTransitions": ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]
}
```

`resolution` is computed from the same rules as the gate. `reasons` lists why Resolved is unavailable (`NO_COMPLETED_ACTION`, `OPEN_ACTIONS`); `canCancel` is false when an Action is Open. This is a hint for the UI; the status endpoint decides. `allowedTransitions` is still the matrix, unchanged by the gate.

### `PUT /api/staff/tickets/:id/status`

Request: `{ "status": "RESOLVED", "expectedUpdatedAt": "2026-11-01T09:12:44.512Z" }` — `expectedUpdatedAt` is the Ticket's `updatedAt` as the user saw it (required, BR-23).

Checks, in order, after the Ticket is locked: stale check → matrix → owner rule → gate.

| Status | Body | When |
| --- | --- | --- |
| 200 | Staff Ticket Detail | allowed; moving to `REOPENED` still clears `requesterResolvedAt` |
| 400 | `VALIDATION_ERROR` field `status` / `expectedUpdatedAt` | unknown status; `expectedUpdatedAt` missing or not a date |
| 404 | `NOT_FOUND` | no such Ticket |
| 409 | `STALE_UPDATE` | the Ticket's `updatedAt` differs from `expectedUpdatedAt` |
| 409 | `INVALID_TRANSITION` | outside the matrix, same status, or from a terminal status |
| 409 | `OWNER_REQUIRED` | moving to IN_PROGRESS / WAITING_FOR_REQUESTER / RESOLVED with no owner |
| 409 | `RESOLUTION_BLOCKED` + `reasons` | moving to `RESOLVED` without a Completed Action or with an Open one (`NO_COMPLETED_ACTION`, `OPEN_ACTIONS`); moving to `CANCELLED` with an Open one (`OPEN_ACTIONS`) |

Example blocked answer: `{ "error": "This Ticket cannot be resolved yet.", "code": "RESOLUTION_BLOCKED", "reasons": ["OPEN_ACTIONS"] }`.

### `PUT /api/staff/tickets/:id/owner` and `PUT /api/staff/tickets/:id/it-priority`

Unchanged, but they accept an optional `expectedUpdatedAt`. When present it must equal the Ticket's `updatedAt`, otherwise `409 STALE_UPDATE`.

### `GET /api/tickets` (My Tickets)

Two new optional query parameters, combined with the existing `search`, `categoryId`, `priority`, `sort`, `page`, `pageSize`:

- An **empty** value (`?status=`) is an unknown value and is refused like any other; omit the parameter for no filter.
- `status`: `open` (not Resolved, Closed or Cancelled), `resolved` (Resolved or Closed), or one of the eight status names. Anything else → `400 VALIDATION_ERROR` field `status`. Default: all.
- `updatedWithinDays`: positive integer up to 365; only Tickets whose `updatedAt` is within that many × 24 hours. Anything else → `400` field `updatedWithinDays`.

### `GET /api/staff/tickets` (queue)

One new optional parameter: `requesterResolved=true` keeps only Tickets whose requester pressed "Problem Appears Resolved". Any other value → `400 VALIDATION_ERROR` field `requesterResolved`. It combines with the existing filters; the default `status=active` still applies.

## Dashboards

Both endpoints answer `200` with concise data (BR-25). They return no more than 5 rows per list, never a full Ticket collection, and compute everything from the live database for the signed-in user. Definitions are in specification BR-26.

### `GET /api/dashboard/requester` (role `REQUESTER`)

```json
{
  "generatedAt": "2026-11-01T10:00:00.000Z",
  "metrics": { "open": 3, "waitingForYou": 1, "resolvedLast30Days": 2 },
  "needsAttention": [ { "id": 12, "ticketNumber": "TKT-2026-000012", "summary": "…", "status": "WAITING_FOR_REQUESTER", "updatedAt": "…" } ],
  "recentlyUpdated": [ { …same item… } ]
}
```

Only the signed-in Requester's Tickets; no IT Priority anywhere. `403` for IT Staff/Administrator, `401` signed out.

### `GET /api/dashboard/staff` (roles `IT_STAFF`, `ADMIN`)

```json
{
  "generatedAt": "…",
  "metrics": { "unassigned": 4, "myActive": 2, "requesterReportsResolved": 1 },
  "byStatus": { "NEW": 3, "OPEN": 5, "IN_PROGRESS": 4, "WAITING_FOR_REQUESTER": 2, "RESOLVED": 1, "CLOSED": 6, "REOPENED": 0, "CANCELLED": 1 },
  "byItPriority": { "LOW": 3, "MEDIUM": 8, "HIGH": 4, "CRITICAL": 1 },
  "urgent": [ { "id": 7, "ticketNumber": "…", "summary": "…", "status": "IN_PROGRESS", "itPriority": "CRITICAL", "owner": { "id": 8, "name": "Krit Staff" }, "updatedAt": "…" } ],
  "recentlyUpdated": [ { …same item as urgent… } ],
  "myRecentActions": [ { "id": 41, "ticketId": 12, "ticketNumber": "…", "description": "Replaced the HDMI sw…", "status": "COMPLETED", "actionAt": "…" } ],
  "users": { "total": 12, "active": 10, "inactive": 2, "byRole": { "REQUESTER": 6, "IT_STAFF": 4, "ADMIN": 2 } }
}
```

`users` is present **only** for `ADMIN` (BR-31). `byStatus` always has all eight keys and `byItPriority` all four, with `0` where nothing matches (BR-29); lists are `[]` when empty. `owner` is `null` for an unowned Ticket. `myRecentActions` lists the Actions whose *performer* is the signed-in user. Its `description` is at most 120 characters: a longer text is cut to 119 characters followed by "…". `403` for a Requester, `401` signed out.

## Summary of HTTP statuses added in Lab 4

| Status | Used for |
| --- | --- |
| 200 | list, edit, complete, cancel, dashboards, replayed create |
| 201 | Action created |
| 400 | invalid field, invalid performer, unknown query value, missing `version` / `expectedUpdatedAt` |
| 401 / 403 | signed out / wrong role or password change required |
| 404 | missing Ticket or Action, another Requester's Ticket, any `DELETE` |
| 409 | not workable, final Action, stale update, resolution blocked, plus the Lab 3 codes |
| 500 | unexpected error, logged on the server only |
