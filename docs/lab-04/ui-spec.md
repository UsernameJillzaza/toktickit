# Lab 4 Zen Green UI Specification

Extends [Lab 3's UI spec](../lab-03/ui-spec.md), which extends Lab 2's. All colour tokens, typography, field and button states, the badge component, the application shell, breakpoints and accessibility rules stay in force; this document adds only what Lab 4 introduces. Rule and AC numbers refer to [specification.md](specification.md).

## 1. Tokens reused, and two additions

All Lab 2/3 tokens are reused unchanged (primary green `#006B3C`, secondary `#0B7A46`, pale green `#EAF6EF`, page `#F5F7F6`, error `#B3261E`, warning amber `#B45309`, read-only `#F0EFE8`, internal-note surface `#FFF7E6`). Additions, defined in `client/src/index.css`:

| Token / class | Value | Used for |
| --- | --- | --- |
| `.tt-metric-card` | white card, 1 px border, 8 px radius, 16 px padding, hover/focus ring in primary green | dashboard cards |
| `.tt-action-card` | white card with a 4 px left border in the Action status colour | one Action Taken |

Actions Taken are visible to the Requester, so they do **not** use the amber internal-note surface; that surface stays reserved for Internal Notes.

## 2. Badges

Same component (`client/src/components/Badges.tsx`) and the same rules: every badge carries **text**, never colour alone, and uses `tt-badge tt-badge-<kind>-<VALUE>` so style tests can check it.

| Kind | Value → style |
| --- | --- |
| Action status (new) | `OPEN` pale green with primary text · `COMPLETED` solid primary green with "✓" · `CANCELLED` grey with "✕" |
| Follow-up (new) | "Follow-up needed" amber outline with "!" when `followUpRequired`; nothing when not |

Displayed text: "Open", "Completed", "Cancelled" (enum values are never shown). Ticket status and priority badges are unchanged.

## 3. Application shell and navigation

- A **"Dashboard"** item is added as the **first** menu item for every role (Requester: Dashboard, My Tickets, Create Ticket; IT Staff: Dashboard, Ticket Queue; Administrator: Dashboard, Ticket Queue, User Management). Active item as in Lab 3 (`aria-current="page"`, pale green).
- `/` redirects to `/dashboard` after sign-in for every role (FR-14); a user who must change the password still goes to Change Password first.
- The temporary "System status" page from Lab 1 stays reachable only by direct URL and is not linked from any menu (BR-36 removes no working route; it is simply not a product screen).

## 4. Dashboard (`/dashboard`)

One route; the component depends on the signed-in role.

### 4.1 Common layout and states

- Page title "Dashboard" and, small and grey, "Updated <time>" from `generatedAt`.
- A grid of **metric cards**: label (e.g. "Unassigned"), large value, a "View" link with an accessible name ("View unassigned tickets"). The whole card is not a link; the "View" link is the single focusable target, so keyboard order is predictable.
- Below the cards, one or more **lists** (max 5 rows): ticket number (link), summary (truncated with ellipsis, full text in `title`), status badge, relative time.
- **Loading:** grey skeleton blocks for cards and lists, `aria-busy="true"` on the region. **Empty list:** a short grey sentence ("No tickets need your attention."). **Zero count:** the card stays and shows `0`. **Failure:** an alert "We couldn't load the dashboard." with a Retry button (no technical details). **Forbidden (403):** the Forbidden page of Lab 3.
- Layout: four cards per row from 1200 px, two per row from 576 px, one per row below; lists stack under the cards; no horizontal scroll at any width.

### 4.2 Requester Dashboard

| Element | Content | "View" destination |
| --- | --- | --- |
| Card "Open tickets" | `metrics.open` | `/my-tickets?status=open` |
| Card "Waiting for you" | `metrics.waitingForYou`, amber accent when > 0 | `/my-tickets?status=WAITING_FOR_REQUESTER` |
| Card "Resolved (last 30 days)" | `metrics.resolvedLast30Days` | `/my-tickets?status=resolved&updatedWithinDays=30` |
| List "Needs your attention" | `needsAttention` rows | each row → `/tickets/:id` |
| List "Recently updated" | `recentlyUpdated` rows | each row → `/tickets/:id` |

The My Tickets screen reads `status` and `updatedWithinDays` from the URL (as the staff queue already reads its filters), shows the active filter as a removable chip, and keeps Lab 2's search, sort and paging. No IT Priority appears anywhere.

### 4.3 IT Staff / Administrator Dashboard

| Element | Content | "View" destination |
| --- | --- | --- |
| Card "Unassigned" | `metrics.unassigned` | `/staff/queue?owner=unassigned` |
| Card "Assigned to me" | `metrics.myActive` | `/staff/queue?owner=me` |
| Card "Requester reports resolved" | `metrics.requesterReportsResolved`, with the ✓ indicator | `/staff/queue?requesterResolved=true` |
| Panel "By status" | eight counts as a compact list, each a link | `/staff/queue?status=<STATUS>` |
| Panel "By IT priority (active)" | four counts, each a link, with priority badges | `/staff/queue?priority=<P>` |
| List "Urgent" | `urgent` rows (Critical, active), owner or "Unassigned" | row → `/staff/tickets/:id`; "View all" → `/staff/queue?priority=CRITICAL` |
| List "Recently updated" | `recentlyUpdated` rows | row → `/staff/tickets/:id` |
| List "My recent actions" | `myRecentActions` rows: description (cut), Action status badge, time | row → `/staff/tickets/:ticketId` |
| Card group "Users" (Administrator only) | total / active / inactive and per role | `/admin/users` |

The queue screen reads `requesterResolved` from the URL like its other filters and shows it as a chip.

## 5. Staff Ticket Detail — Actions Taken area

Placed in the left column under the Ticket information and Attachments, above Public Comments, with its own region (`role="region"`, label "Actions taken"). A one-line note under the heading: "Visible to the requester. Put confidential details in Internal Notes."

### 5.1 List

- Each Action is a `.tt-action-card`: action time (local), performer name and role badge, status badge, description, then Result (when present), a "Follow-up needed" badge with the note, and Attachment Notes (when present). Ordered as the API returns them (BR-12).
- Open Actions show buttons **Edit**, **Complete**, **Cancel**; Completed and Cancelled show none (read-only, BR-10).
- Empty: "No actions taken yet." Loading: skeleton. Failure: alert with Retry.
- The heading shows the counts ("2 completed, 1 open") from `actionCounts`.
- When `workable` is false (Ticket resolved/closed/cancelled) the "New action" button is disabled with the visible reason "Reopen the ticket to add actions" (a tooltip alone is not enough, BR-11).

### 5.2 Create mode

"New action" opens an inline form (not a modal, so keyboard and screen-reader use stay simple): Action date and time (`datetime-local`, default now), Description (required, textarea, counter x / 2000), Performed by (select of active staff, default me), Follow-up required (checkbox), Follow-up note (textarea, appears when the checkbox is on and is then required; hidden and cleared when it is off), Attachment notes (text, ≤ 500). Buttons: **Save action** (primary), **Cancel** (secondary, discards after confirming only if the form is dirty).

- **Validation:** an error appears directly under the field, the field gets `aria-invalid`, and focus moves to the first invalid field on submit. Empty required fields are caught in the client without a request; the server stays the authority and its `field` errors land under the same field.
- **Duplicate protection (BR-32):** Save is disabled with the label "Saving…" while the request runs; a new `requestKey` is generated when the form opens and reused for retries of that form.
- **Failures:** a network failure keeps every value and shows "Unable to reach the server. Please try again." above the buttons; `PERFORMER_INVALID` shows under Performed by; `TICKET_NOT_WORKABLE` shows a banner and disables the form.

### 5.3 View/edit mode

- **Edit** turns the card into the same form pre-filled; **Save changes** sends the `version` it loaded. On `STALE_UPDATE` the form stays open with the banner "This action was changed by someone else. Reload to see the latest." and a **Reload** button that refetches the list and drops the unsaved edit only after the user chooses it (the typed text stays visible until then).
- **Complete** opens a small inline panel under the card: "Result" (required), button "Mark completed". **Cancel** opens "Reason" (required) and "Cancel action". Both are confirmations (`role="alertdialog"` is used only for the ticket-level confirmations that exist from Lab 3; these panels are inline and keyboard-focused on the textarea).
- After any success the list refetches, the card shows its new status, and the Ticket summary status/priority at the top of the page is refreshed (AC-24).

## 6. Requester Ticket Detail — Actions Taken

A read-only region "Actions taken" between the Ticket information and Public Comments, same card layout as 5.1 without buttons and without the "visible to the requester" note, with the heading "Work done on your ticket". Empty text: "No actions have been recorded yet." The Requester never sees Internal Notes in or near this region.

## 7. Ticket workflow feedback (Staff Ticket Detail, Operations card)

- The **Change status** options come from `allowedTransitions` (unchanged). A **resolution hint** line sits under the control when `resolution.canResolve` is false: "Resolved needs at least one completed action and no open actions." with the specific reasons ("1 action is still open.").
- Choosing Resolved or Cancelled still opens the Lab 3 confirmation. The status request sends `expectedUpdatedAt`.
- `RESOLUTION_BLOCKED` shows the reasons under the control; `STALE_UPDATE` shows "This ticket changed. Reload to continue." with a Reload button; both keep the user's choice visible. A success refreshes the whole summary (status badge, allowed options, hint).

## 8. Feedback catalogue (consistency rules for every new screen)

| State | Pattern |
| --- | --- |
| Loading | skeleton or "Loading…" text in the region, `aria-busy` |
| Empty / no results | one grey sentence, never a blank area |
| Validation | message under the field, `aria-invalid`, focus to the first invalid field |
| Success | short green "Saved" badge near the control for 3 s; for status changes the summary itself updates |
| Forbidden | the Forbidden page (Lab 3) |
| Not found | the Not Found page; an Action or Ticket that no longer exists shows "not found" and a link back |
| Conflict (409) | banner or inline message plus a Reload action; typed values are kept |
| Safe failure | "Unable to reach the server. Please try again." (network) or the server's `error` text (known codes); never a stack trace |

## 9. Responsive rules

As Lab 2 §10 and Lab 3 §11, plus:

- Dashboard grid: 4 / 2 / 1 columns at ≥ 1200 / ≥ 576 / below.
- Actions Taken cards are single-column at every width; the form fields stack below 768 px and use two columns at ≥ 992 px; the performer and date fields share a row on wide screens only.
- Staff Ticket Detail keeps its two-column layout only at ≥ 992 px (Lab 3).
- Every button is at least 44 px tall on mobile (Lab 3 rule, extended to the new buttons).
- No horizontal page scroll at 1280, 820 or 375 px on any new screen.

## 10. Accessibility

- Every control has a visible label or an `aria-label`; the "View" links have specific accessible names; metric values are plain text, not images.
- Status is always text plus colour; the Action status badges include a symbol and text.
- Visible keyboard focus on all new controls (the Bootstrap focus ring; no `outline: none`).
- Keyboard order follows reading order; the create/edit forms are inline, so there is no focus trap to manage; the existing confirmation dialogs keep their focus handling.
- Errors are announced: the validation message sits in the field's `aria-describedby`, banners use `role="alert"`.
- Contrast stays at or above the Lab 2 targets (primary green on white, amber text only on a pale surface).

## 11. Visual and Accessibility Inspection Checklist

Completed in L4-7/L4-8 from real screens and tests only; each tick names its evidence. Unticked now.

- [ ] Dashboard (all roles) matches the Zen Green tokens and the shell of Labs 2–3
- [ ] Cards: label, value, accessible "View" link; zero and empty states shown
- [ ] Drill-down opens the right filtered list and the list count equals the card
- [ ] Actions Taken: list, create mode and view/edit mode distinct and consistent; Complete/Cancel panels clear
- [ ] Editable versus read-only fields clearly different (Open vs Completed/Cancelled; Requester view)
- [ ] Validation messages directly under the field; focus moves to the first invalid field
- [ ] Status and follow-up never conveyed by colour alone
- [ ] Visible keyboard focus on the new controls (automatic check on the new forms, shared style elsewhere — state exactly what was checked)
- [ ] No clipped text, overlapping controls or horizontal scroll at 1280 / 820 / 375 px
- [ ] Mobile buttons at least 44 px tall
- [ ] Conflict, forbidden, not-found and safe-failure states consistent with Labs 2–3
- [ ] No console errors, broken links, placeholder text or unfinished controls

## 12. Screenshot paths

```text
artifacts/lab-04/screenshots/
├── staff-dashboard/       dashboard-desktop/-tablet/-mobile, empty, failure, loading, drill-down result, metric-vs-database
├── requester-dashboard/   dashboard-desktop/-tablet/-mobile, empty, drill-down result, other-requester-isolation
└── actions-taken/         list, create-form, create-validation, edit, complete, cancel, stale-conflict,
                           inactive-performer-rejected, requester-read-only, different-performers, resolution-blocked,
                           mobile/tablet layouts
```
