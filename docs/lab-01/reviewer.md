# Lab 1 — Peer Review

Per CPE334 Lab 1 §12, all Pull Requests require peer review. This file records the reviewer and the reviewed PRs, in both directions (§14 Part 1).

## Reviewer details

| Field | Value |
| --- | --- |
| Name | Jakkarin Promsee |
| Student ID | _TODO: add reviewer's student ID_ |
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

_TODO — pending: my partner adds me as a collaborator on their repo, then I review their PRs and
record the links, my review comment, and their response here (the reciprocal direction §14 Part 1
requires)._

| Issue | PR | Title | Link | Verdict |
| --- | --- | --- | --- | --- |
| _TODO_ | _TODO_ | _TODO_ | _TODO_ | _TODO_ |

### Review comment I gave and how my partner responded

> **Me:** _TODO_

**Partner's response:** _TODO_
