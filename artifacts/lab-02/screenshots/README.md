# Lab 2 UI Screenshots

Expected layout (per labsheet §12 and `e2e/lab-02/requester-ticket-flow.spec.ts`):

```
create-ticket/{desktop,tablet,mobile}.png
my-tickets/{desktop,tablet,mobile}.png
ticket-detail/{desktop,tablet,mobile}.png
```

**Not populated in this PR.** The Playwright spec that generates these could not run in the
sandboxed environment this Issue was implemented in — `npx playwright install chromium` timed out
downloading the browser binary against what looks like a network restriction on that specific host
(retried against a mirror too; the npm registry itself was reachable throughout, so this wasn't
general connectivity). Run `npx playwright install chromium && npx playwright test` with `server`
and `client` both running to populate this folder for real, then commit the 9 PNGs.

The actual UI was verified manually at all three breakpoints instead (see the PR description) and
the responsive bugs that check found — an overlapping mobile nav, and My Tickets not switching to
a card layout on mobile — were fixed as part of this Issue, not just noted.
