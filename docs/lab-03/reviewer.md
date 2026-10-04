# Lab 3 — Peer Review

> **Status: in review.** PRs #47–#55 (L3-1 … L3-9) were reviewed and approved by Jakkarin and merged into `lab3-staging` with merge commits on 2026-10-04. The L3-10 and release rows, and the two sections about my own reviews of Jakkarin's repository, are still `TODO` and must be filled from the real GitHub PRs: real numbers, real quoted comments. Nothing in those sections may be written from memory or invented.

## My reviewer

| Field | Value |
| --- | --- |
| Name | Jakkarin Promsee |
| Student ID | 67070501009 |
| GitHub username | @jakkarin-promsee |

## PRs my reviewer reviewed and approved for me

| Issue | PR | Title | Verdict |
| --- | --- | --- | --- |
| #37 | [#47](https://github.com/UsernameJillzaza/toktickit/pull/47) | Sprint 3 engineering contract (specification, API, UI, tests) | Approved by @jakkarin-promsee; merged |
| #38 | [#48](https://github.com/UsernameJillzaza/toktickit/pull/48) | Authentication foundation: User migration, sessions, and auth API | Approved by @jakkarin-promsee; merged |
| #39 | [#49](https://github.com/UsernameJillzaza/toktickit/pull/49) | Login, Change Password, and role-aware application shell | Approved by @jakkarin-promsee; merged |
| #40 | [#50](https://github.com/UsernameJillzaza/toktickit/pull/50) | Requester endpoints use the session identity; authorization tests | Approved by @jakkarin-promsee; merged |
| #41 | [#51](https://github.com/UsernameJillzaza/toktickit/pull/51) | IT Staff Ticket Queue: workflow migration, queue API, queue screen | Approved by @jakkarin-promsee; merged |
| #42 | [#52](https://github.com/UsernameJillzaza/toktickit/pull/52) | IT Staff Ticket Detail: claim / assign, IT Priority, status | Approved by @jakkarin-promsee; merged |
| #43 | [#53](https://github.com/UsernameJillzaza/toktickit/pull/53) | Public comments, internal notes, and "Problem Appears Resolved" | Approved by @jakkarin-promsee; merged |
| #44 | [#54](https://github.com/UsernameJillzaza/toktickit/pull/54) | Administrator user management with last-admin safety | Approved by @jakkarin-promsee; merged |
| #45 | [#55](https://github.com/UsernameJillzaza/toktickit/pull/55) | Lab 3 Playwright suite, responsive checks, and screenshot evidence | Approved by @jakkarin-promsee; merged |
| #46 | TODO | Lab 3 documentation | TODO |
| — | TODO | Release: `lab3-staging` → `main` | TODO |

### Review comment I received and how I responded ([PR #53](https://github.com/UsernameJillzaza/toktickit/pull/53))

Jakkarin's comment on `server/src/tickets/conversation.ts` ([link](https://github.com/UsernameJillzaza/toktickit/pull/53#discussion_r4175604901)). He had raised the same point earlier on [PR #47](https://github.com/UsernameJillzaza/toktickit/pull/47) (on `specification.md`, BR-26):

> BR-26 says a new Internal Note moves `updatedAt`, and this does exactly that. But `REQUESTER_LIST_SELECT` and `REQUESTER_DETAIL_SELECT` in `app.ts` both return `updatedAt` to the Requester. So a Requester who polls their ticket can see `updatedAt` change with no new comment and no status change, and work out that IT wrote something internal about them. The client doesn't display it today, but it's in the response.

He is right: the Requester screens don't show the value, but it is in the response, so the Internal Notes rule (BR-32, notes never visible to the Requester) leaks through a side channel. I did **not** reply on the PR, and I did not change the API in this sprint. His two suggested fixes (drop `updatedAt` from the Requester response shapes, or stop notes from bumping it) both touch endpoints that had already been reviewed and merged in earlier PRs. I recorded it instead as an accepted known limitation, with the preferred future fix, in `docs/lab-03/tests.md` §7.2 (`updatedAt` ฝั่ง Requester).

## PRs I reviewed for my partner

TODO — table of the PRs I reviewed in Jakkarin's repository (real links), with my verdict for each.

### Review comment I gave and how my partner responded (PR TODO)

TODO — one real comment I left, quoted with a link, and how it was resolved.
