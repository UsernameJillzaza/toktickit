# Lab 2 — Peer Review

## My reviewer

| Field | Value |
| --- | --- |
| Name | Jakkarin Promsee |
| Student ID | 67070501009 |
| GitHub username | @jakkarin-promsee |

## PRs my reviewer reviewed and approved for me

| Issue | PR | Title | Verdict |
| --- | --- | --- | --- |
| #13 | [#20](https://github.com/UsernameJillzaza/toktickit/pull/20) | Sprint specification and test plan | Approved (single round) |
| #14 | [#21](https://github.com/UsernameJillzaza/toktickit/pull/21) | Development Requester context | Requested changes → fixed → Approved (two rounds) |
| #15 | [#22](https://github.com/UsernameJillzaza/toktickit/pull/22) | Category and Related System reference data | Approved (single round, one non-blocking suggestion) |
| #16 | [#23](https://github.com/UsernameJillzaza/toktickit/pull/23) | Ticket creation | Approved (single round) |
| #17 | [#24](https://github.com/UsernameJillzaza/toktickit/pull/24) | My Tickets list | Approved (single round) |
| #18 | [#25](https://github.com/UsernameJillzaza/toktickit/pull/25) | Ticket Detail and Attachments | Approved (single round) |
| #19 | [#26](https://github.com/UsernameJillzaza/toktickit/pull/26) | Zen Green UI polish and responsive pass | Approved (single round) |

### Review comment I received and how I responded (PR #21)

PR #21 was reviewed at length, and two items in the review turned out to reference fields and
response shapes (`RequesterUser`/`displayName`, a `{ data: [...] }` envelope, specific error codes)
that don't exist anywhere in this repo's own `docs/lab-02/specification.md` or `api-spec.md`. Two
other findings in the same review — the Continue button never actually being disabled, and
`readStoredRequester()` trusting unvalidated `localStorage` content — were real and were fixed.

**My response**, posted directly on the PR:

> Thanks for the detailed pass. Pushed two fixes:
>
> - Continue no longer auto-selects the first requester — it starts on a placeholder option and
>   stays `disabled` until a real choice is made. Added a test for both the disabled state and the
>   enabled-after-selecting transition.
> - `readStoredRequester()` now validates the shape of whatever comes out of `localStorage`... Added
>   tests for `{}` and a non-object value both falling back to "no requester selected."
>
> On the two schema/API-shape blocking points: I checked `docs/lab-02/specification.md` §7 and
> `docs/lab-02/api-spec.md` directly on `lab2-staging` (`git show lab2-staging:docs/lab-02/...`),
> and neither matches what was quoted — there's no `RequesterUser` model or `displayName` field
> anywhere, no `Ticket` model in the repo yet at all (that's Issue #16, not started), and
> `GET /api/requesters` in the actual merged `api-spec.md` returns a bare array, not a
> `{ data: [...] }` envelope. Could you double-check which branch/file that was reviewed against?

Later reviewing PRs #22–#26, the pattern became clearer: reviewing my partner's own repo for the
reciprocal direction below showed his implementation genuinely uses `RequesterUser`/`displayName`
and a header-based `X-Requester-Id` — a different, independently valid design from mine, from his
own separate Spec-DD pass on the same labsheet. The two projects aren't supposed to share one
schema; the mismatch looks like his review process cross-referenced his own repo's conventions
against mine rather than reading this repo's actual `docs/lab-02/` files.

## PRs I reviewed for my partner

Reviewed on [jakkarin-promsee/toktickit](https://github.com/jakkarin-promsee/toktickit).

| Issue | PR | Title | Verdict |
| --- | --- | --- | --- |
| #11 | [#19](https://github.com/jakkarin-promsee/toktickit/pull/19) | Lab 2 engineering contract and test plan | Approved |
| #12 | [#20](https://github.com/jakkarin-promsee/toktickit/pull/20) | Lab 2 database foundation and seed data | Approved |
| #13 | [#21](https://github.com/jakkarin-promsee/toktickit/pull/21) | Development Requester selection and context | Approved |
| #14 | [#22](https://github.com/jakkarin-promsee/toktickit/pull/22) | Requester ticket creation | Approved |
| #15 | [#23](https://github.com/jakkarin-promsee/toktickit/pull/23) | My Tickets search, filter, sort, and pagination | Approved |
| #16 | [#24](https://github.com/jakkarin-promsee/toktickit/pull/24) | Requester-owned Ticket Detail | Approved |
| #17 (partial) | [#25](https://github.com/jakkarin-promsee/toktickit/pull/25) | Attachment upload, download, and soft removal | Approved |

His Issues #17 (integration/E2E/responsive/visual evidence) and #18 (release integration) were
still open as of this writing — PR #25 covers the attachment-lifecycle part of #17, not the full
Issue, so reciprocal review continues once he opens the remaining PRs.

### Review comment I gave and how my partner responded (PR #22)

> **Me:** This imports `findAvailableTicketNumber` from `ticket-number.ts` but doesn't call it —
> `createTicket()` re-implements its own count-then-retry loop against `formatTicketNumber`
> directly, using the Prisma unique-constraint catch as the availability check instead of the
> helper's `isAvailable` predicate. That's arguably a more honest check (the DB constraint doesn't
> lie the way a separate existence query could under a race), but it leaves the already-unit-tested
> helper unused in production. Intentional, or should this call `findAvailableTicketNumber`
> directly? Also worth confirming `npm run build` doesn't flag the now-unused import if
> `noUnusedLocals` is on.

**Partner's response:** "Thank" (brief acknowledgment on the PR; approved and merged without
further discussion on this thread).
