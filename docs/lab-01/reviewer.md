# Lab 1 — Peer Review

Per CPE334 Lab 1 §12, all Pull Requests require peer review. This file records the reviewer and the reviewed PRs, in both directions (§14 Part 1).

## Reviewer details

| Field | Value |
| --- | --- |
| Name | Jakkarin Promsee |
| Student ID | 67070501009 |
| GitHub username | [jakkarin-promsee](https://github.com/jakkarin-promsee) |

## Pull Requests my reviewer approved for me

| Issue | PR | Title | Result |
| --- | --- | --- | --- |
| #1 | [#5](https://github.com/UsernameJillzaza/toktickit/pull/5) | Set up the TokTickIT project foundation | Approved |
| #2 | [#6](https://github.com/UsernameJillzaza/toktickit/pull/6) | Implement the API health check | Approved |
| #3 | [#7](https://github.com/UsernameJillzaza/toktickit/pull/7) | Create and seed IT request categories | Approved |
| #4 | [#8](https://github.com/UsernameJillzaza/toktickit/pull/8) | Display the IT request category list | Changes requested → fixed → Approved |

### Review comment I received and how I responded (PR #8)

This PR went through a full request-changes round, which is the clearest example.

> **Reviewer (Jakkarin):** One blocker on §7.4 "returns each category ID and name in a predictable
> order": the `findMany` in `/api/categories` has no `orderBy`, so the row order comes from
> PostgreSQL's default physical order — not guaranteed. It only returns 1–4 because the table was
> freshly seeded in that order, which is also why `categories.test.ts` passes: it checks the names
> are present (`toContain`), not their order. Please add `orderBy: { id: 'asc' }` and strengthen the
> test to assert the ordered sequence.

**My response:** Good catch — the order was only holding by accident of the seed insertion order.
Fixed in commit `ff10525`: added `orderBy: { id: 'asc' }` to guarantee ascending-id order (§10.2),
and rewrote API-02 to assert the exact sequence with `toEqual([...])` instead of `toContain`, so it
now fails if the order regresses. Re-requested review; the reviewer then approved.

## Pull Requests I reviewed for my partner

Reviewed on [jakkarin-promsee/toktickit](https://github.com/jakkarin-promsee/toktickit).

| Issue | PR | Title | Verdict |
| --- | --- | --- | --- |
| #1 | [#5](https://github.com/jakkarin-promsee/toktickit/pull/5) | Set up the TokTickIT project foundation | Approved (single round) |
| #2 | [#6](https://github.com/jakkarin-promsee/toktickit/pull/6) | Implement the API health check | Approved (single round, 6 inline comments) |
| #3 | [#7](https://github.com/jakkarin-promsee/toktickit/pull/7) | Create and seed IT request categories | Requested changes → fixed → Approved (two rounds) |
| #4 | [#8](https://github.com/jakkarin-promsee/toktickit/pull/8) | Display the IT request category list | Approved (single round, 6 inline comments) |

### Review comment I gave and how my partner responded (PR #7)

The clearest round-trip, mirroring the PR #8 exchange above.

> **Me (round 1, Requested changes):** The model, the migration, and the upsert seed all match the
> Issue #3 spec. I pulled the branch and ran `npx prisma db seed` twice — 4 rows both times, and
> `createdAt` did not move on the second run, so the idempotency claim holds. Two things before I
> approve: a set of editor/cache files that should not be in the repository, and an error path in
> the seed that skips `$disconnect()`. Both are in the line comments.

**Jakkarin's response:** Fixed both. On the ignored files: *"Agreed, these came in on a `git add .`
… Removed both from the index with `git rm -r --cached .obsidian client/.vite` and added the rules
you suggested … Verified with a clean `git status`."* On the seed script: *"Good catch, I had the
semantics backwards … Switched to `process.exitCode = 1`."*

> **Me (round 2, Approve):** Both fixed, verified against the current branch, not just the
> description … AC 1–5 all still hold after the merge from `lab1-staging`. Approving.

**Other PRs (#5, #6, #8):** approved in a single round each, with substantive top-level comments and
inline line comments (verified test output, walked through the failure paths, checked design
decisions like the 503-vs-500 status choice on #8). No blocking issues found; Jakkarin merged
directly without a text reply since nothing required a fix.

> **Accuracy note:** the exact comment text above was reconstructed from the rendered GitHub pages,
> not the raw markdown, so formatting may not be byte-for-byte identical to what's posted. Verified
> substantively correct against screenshots of the live threads.

> **Collaborator status confirmed:** the PR #7 review screenshot shows a "Collaborator" badge next
> to my username on my partner's repo (and Jakkarin's PR #8 review shows the same badge on mine) —
> visual proof of real collaborator access on both sides, not just public commenting.
