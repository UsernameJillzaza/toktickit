# Lab 3 — Peer Review

> **Status: in review.** PRs #47–#56 (L3-1 … L3-10) were reviewed and approved by Jakkarin and merged into `lab3-staging` with merge commits on 2026-10-04. Only the release PR row is still `TODO`, because that PR doesn't exist yet. Nothing in that row may be written from memory or invented.

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
| #46 | [#56](https://github.com/UsernameJillzaza/toktickit/pull/56) | Lab 3 documentation | Approved by @jakkarin-promsee; merged |
| — | TODO | Release: `lab3-staging` → `main` | TODO |

### Review comment I received and how I responded ([PR #53](https://github.com/UsernameJillzaza/toktickit/pull/53))

Jakkarin's comment on `server/src/tickets/conversation.ts` ([link](https://github.com/UsernameJillzaza/toktickit/pull/53#discussion_r4175604901)). He had raised the same point earlier on [PR #47](https://github.com/UsernameJillzaza/toktickit/pull/47) (on `specification.md`, BR-26):

> BR-26 says a new Internal Note moves `updatedAt`, and this does exactly that. But `REQUESTER_LIST_SELECT` and `REQUESTER_DETAIL_SELECT` in `app.ts` both return `updatedAt` to the Requester. So a Requester who polls their ticket can see `updatedAt` change with no new comment and no status change, and work out that IT wrote something internal about them. The client doesn't display it today, but it's in the response.

He is right: the Requester screens don't show the value, but it is in the response, so the Internal Notes rule (BR-32, notes never visible to the Requester) leaks through a side channel. I did **not** reply on the PR, and I did not change the API in this sprint. His two suggested fixes (drop `updatedAt` from the Requester response shapes, or stop notes from bumping it) both touch endpoints that had already been reviewed and merged in earlier PRs. I recorded it instead as an accepted known limitation, with the preferred future fix, in `docs/lab-03/tests.md` §7.2 (`updatedAt` ฝั่ง Requester).

## PRs I reviewed for my partner

All ten were reviewed in `jakkarin-promsee/toktickit` on 2026-10-04 (UTC) and approved with 2–3 line comments each (24 in total). All are merged into his `lab3-staging`.

| PR | Title | My verdict |
| --- | --- | --- |
| [#42](https://github.com/jakkarin-promsee/toktickit/pull/42) | Define the Lab 3 engineering contract and test plan | Approved, then merged by Jakkarin |
| [#43](https://github.com/jakkarin-promsee/toktickit/pull/43) | Build the Lab 3 user migration and data foundation | Approved, then merged by Jakkarin |
| [#44](https://github.com/jakkarin-promsee/toktickit/pull/44) | Add authentication foundation and mandatory first-login password change | Approved, then merged by Jakkarin |
| [#45](https://github.com/jakkarin-promsee/toktickit/pull/45) | Enforce authenticated authorization and role-aware application shell | Approved, then merged by Jakkarin |
| [#46](https://github.com/jakkarin-promsee/toktickit/pull/46) | Add authenticated Requester workflow, Public Comments, and Problem Appears Resolved | Approved, then merged by Jakkarin |
| [#47](https://github.com/jakkarin-promsee/toktickit/pull/47) | Add IT Staff Ticket Queue with search, filters, sorting, and pagination | Approved, then merged by Jakkarin |
| [#48](https://github.com/jakkarin-promsee/toktickit/pull/48) | Add IT Staff Ticket Detail with ownership, IT Priority, status workflow, and Internal Notes | Approved, then merged by Jakkarin |
| [#49](https://github.com/jakkarin-promsee/toktickit/pull/49) | Add Administrator User Management with account safety rules | Approved, then merged by Jakkarin |
| [#50](https://github.com/jakkarin-promsee/toktickit/pull/50) | Complete Lab 3 automated test coverage and traceability | Approved, then merged by Jakkarin |
| [#51](https://github.com/jakkarin-promsee/toktickit/pull/51) | Add Lab 3 end-to-end workflows for authentication, Requester, IT Staff, and Administrator | Approved, then merged by Jakkarin |

### Review comment I gave and how my partner responded ([PR #45](https://github.com/jakkarin-promsee/toktickit/pull/45))

My comment on `server/src/app.ts` ([link](https://github.com/jakkarin-promsee/toktickit/pull/45#discussion_r4175654413)):

> This helper keeps the important ordering together: session validation, role validation, password-change gating, and CSRF verification for unsafe calls. It makes the endpoint handlers much easier to audit because they no longer need to reconstruct the authorization decision individually.

This was a positive comment on a design choice, so it asked for no change. Jakkarin did not reply to it, and no commit was added to the branch after my review (the PR was merged about a minute after I approved). None of my comments on PRs #42–#51 received a reply on GitHub, so I have no review-then-fix cycle to show from this direction. The review-then-respond evidence for this lab is the one in the section above, where Jakkarin reviewed my PRs.
