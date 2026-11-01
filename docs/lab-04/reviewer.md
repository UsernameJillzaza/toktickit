# Lab 4 — Peer Review

> **Status: complete except the last two rows.** PRs #71–#77 (L4-1 … L4-7) were reviewed and approved by Jakkarin and merged into `lab4-staging` with merge commits on 2026-11-01. The documentation PR for L4-8 and the release PR (`lab4-staging` → `main`) are added to the table below when they are merged, because a record cannot list the PR that adds it with its final verdict. Every statement here was taken from the pull requests and reviews on GitHub, not from memory.

## My reviewer

| Field | Value |
| --- | --- |
| Name | Jakkarin Promsee |
| Student ID | 67070501009 |
| GitHub username | @jakkarin-promsee |

## PRs my reviewer reviewed and approved for me

Each PR got one top-level review that checks the Issue's acceptance criteria one by one, plus 2–4 inline comments.

| Issue | PR | Title | Inline comments | Verdict |
| --- | --- | --- | --- | --- |
| #63 | [#71](https://github.com/UsernameJillzaza/toktickit/pull/71) | Sprint 4 engineering contract | 3 | Approved by @jakkarin-promsee; merged |
| #64 | [#72](https://github.com/UsernameJillzaza/toktickit/pull/72) | Actions Taken foundation: migration, model, seed, and API with authorization and retry safety | 4 | Approved by @jakkarin-promsee; merged |
| #65 | [#73](https://github.com/UsernameJillzaza/toktickit/pull/73) | Ticket workflow: Resolved/Cancelled gate on Actions and stale-update detection for status changes | 3 | Approved by @jakkarin-promsee; merged |
| #66 | [#74](https://github.com/UsernameJillzaza/toktickit/pull/74) | Actions Taken UI: staff list, forms and Complete/Cancel, read-only Requester view, resolution hint and Reload | 4 | Approved by @jakkarin-promsee; merged |
| #67 | [#75](https://github.com/UsernameJillzaza/toktickit/pull/75) | Dashboard APIs: Requester and IT Staff/Admin dashboards, plus the drill-down filters | 4 | Approved by @jakkarin-promsee; merged |
| #68 | [#76](https://github.com/UsernameJillzaza/toktickit/pull/76) | Dashboard UIs and navigation: Requester and IT Staff/Admin dashboards, Dashboard as every role's home, drill-down filters | 2 | Approved by @jakkarin-promsee; merged |
| #69 | [#77](https://github.com/UsernameJillzaza/toktickit/pull/77) | Hardening and proof: Lab 4 E2E suites, three defects they found, and screenshot evidence | 4 | Approved by @jakkarin-promsee; merged |
| #70 | (this PR) | L4-8 Lab 4 documentation and the review follow-ups | — | added after merge |
| — | (release PR) | Release Lab 4 (`lab4-staging` → `main`) | — | added after merge |

Every PR was opened only after the previous one had merged, so Jakkarin reviewed them one at a time. The Lab 3 reflection release PR [#62](https://github.com/UsernameJillzaza/toktickit/pull/62) (into `main`, before Lab 4 began) was also approved by him.

### Review comments I received and what I did about them

I did not reply to the comments on GitHub (I do not usually answer them there); my response is the commit that changed the code or the document. **Findings from #71 and #72 were fixed before the next PR; the findings from #73 to #77 were fixed together in the L4-8 pull request**, because I merged each of those PRs on the strength of the approval without reading its inline comments first. That was a failure in how I worked, and it is described in `ai-use.md`.

**Fixed immediately** (commit `d71856b`, "answer the review of the Actions Taken PR", before L4-3):

| PR | Jakkarin's point (short) | What changed |
| --- | --- | --- |
| #72 `validation.ts` ([comment](https://github.com/UsernameJillzaza/toktickit/pull/72#discussion_r4434864854)) | The limits count characters, but `String.length` counts UTF-16 units, so a description of 1,001 emoji is rejected at 2,002 | The limits count with `Array.from(value).length`; BR-04 says so; a test uses emoji |
| #72 `seed-actions.ts` ([comment](https://github.com/UsernameJillzaza/toktickit/pull/72#discussion_r4434864303)) | A seeded Ticket whose summary changes would have its Actions skipped silently, and the seed would still print "(0 new)" | The seed counts the skipped ones and warns |
| #71 `specification.md`, status matrix | Only some cells carried the word "Owner", so a reader scanning cells would think the owner rule differs between moves | The word is out of the cells; the sentence above the table says the owner rule is true for every cell |
| #71 `tests.md` | A wall-clock threshold alone can fail on a slow machine and gets "fixed" by raising the number | The check became the median of five calls (D-14) |

**Fixed in L4-8** (the commits are named after the review they answer):

| PR | Jakkarin's point (short) | What changed |
| --- | --- | --- |
| #77, `ActionsTaken.tsx` / the refresh (**a real defect I introduced**) | After the panel refetches, an open edit or Complete form sends the *newest* `version`, so a save overwrites someone else's change with no stale banner | Each form keeps the `version` (and values) it was opened with; tests: open a form, bump the version in the refetched list, save, expect the old version and the stale banner (and the same for the Complete panel). Mutation-checked |
| #74, `ActionsTaken.tsx` | An edit sends every field, so the seconds of the time are rewritten and the Action can move in the list | An edit sends only the fields the user changed; "Nothing was changed." when none; tests |
| #74, create retry | After a network error a retry with corrected text gets `200` with the earlier Action and says "Saved" | The form compares the returned text; if it differs it stays open and says the action was already saved with the earlier text; tests |
| #74, a `400` for a field the form does not draw | Gave no message at all | The message goes to the banner; test |
| #74, region name | ui-spec §6 names the Requester region "Actions taken" | The region has that name; tests updated |
| #73 / #74, stale refresh | After a note or comment the screen picked up a newer `updatedAt` without showing what changed | The panel and the conversations refetch with the ticket (L4-7), and the forms keep what they opened with (above) |
| #75, `app.ts` / `staff/routes.ts` | `?status=` (empty) was treated as "no filter" | An empty value is `400` like any unknown value; api-spec says so; tests |
| #75, error path | No test made a dashboard query fail on the server | A test per endpoint expects a safe `500` with `code: SERVER_ERROR` and none of the error text |
| #75, performance test | The Actions-list measurement passed silently when nothing was seeded | It now fails unless Actions exist |
| #75, specification | `myRecentActions` was ambiguous (performed by, or created by) | BR-26 now says "whose performer is the signed-in user" |
| #76, `MyTickets.tsx` | My Tickets never says the total, so the card cannot be read against the list | It prints "N tickets"; test |
| #76, refused filter | A hand-edited bad value showed a generic failure beside a chip claiming the filter was on | The server's message is shown for a `400` on My Tickets and on the queue; tests |
| #77, E2E-04 | The "walk every page" claim was not what the code did (it expanded links only on the first eight pages) | It visits up to three pages of each kind of page and asserts which kinds each role reached |
| #77, RESP-01 | The dashboards' links are the main way in but were not 44 px tall on a phone | CSS gives them the target size and RESP-01 measures them (it failed before the CSS) |
| #77, evidence image | "metric-vs-database" could be mistaken for a database client | The image states that the spec generated it |

**Recorded, not changed.** Two comments are kept as documented limitations in `tests.md` §7: the performance guard cannot count queries (the Prisma client here cannot be given a query log after creation, so only the median-of-five check remains), and API-27 passes because three rules each close the resolve/create race rather than isolating the gate's own count (#73). The 30-day card/list evaluation moment (#71) is in §7 as well.

## PRs I reviewed for my partner

All seven were reviewed in `jakkarin-promsee/toktickit` on 2026-11-01 and approved with a top-level review and 2–4 inline comments each (20 inline comments in total). All are merged into his `lab4-staging`, and his release PR #70 into `main` was approved by me and merged.

| PR | Title | My verdict |
| --- | --- | --- |
| [#64](https://github.com/jakkarin-promsee/toktickit/pull/64) | Define the Lab 4 engineering contract and test plan | Approved, then merged by Jakkarin |
| [#65](https://github.com/jakkarin-promsee/toktickit/pull/65) | Add Actions Taken data foundation and REST API | Approved, then merged by Jakkarin |
| [#66](https://github.com/jakkarin-promsee/toktickit/pull/66) | Add role-aware Actions Taken to Ticket Detail | Approved, then merged by Jakkarin |
| [#67](https://github.com/jakkarin-promsee/toktickit/pull/67) | Enforce the final Ticket workflow and Actions Taken resolution gate | Approved, then merged by Jakkarin |
| [#68](https://github.com/jakkarin-promsee/toktickit/pull/68) | Add Lab 4 role dashboards with authoritative metrics and drill-down filters | Approved, then merged by Jakkarin |
| [#69](https://github.com/jakkarin-promsee/toktickit/pull/69) | Complete Lab 4 E2E, regression, accessibility, and final hardening | Approved, then merged by Jakkarin |
| [#70](https://github.com/jakkarin-promsee/toktickit/pull/70) | Release the reviewed Lab 4 increment from staging to main | Approved, then merged by Jakkarin |

### Review comment I gave and how my partner responded ([PR #67](https://github.com/jakkarin-promsee/toktickit/pull/67))

My comment on `server/src/app.ts` ([link](https://github.com/jakkarin-promsee/toktickit/pull/67#discussion_r4434983889)):

> Good placement for the current-cycle Action check. It runs after the conditional version bump but before the transaction commits, so a failed gate rolls back both the status change and its event; the Reopened version is compared as an integer rather than relying on timestamps.

This was a positive comment on a design choice, so it asked for no change. Jakkarin did not reply to it, and no commit was added to any of PRs #64–#70 after my reviews (checked through the GitHub API). None of my comments on these seven PRs received a reply, so I have no review-then-fix cycle to show from this direction. The review-then-respond evidence for this lab is the one in the section above, where Jakkarin reviewed my PRs.
