# Lab 2 UI Screenshots

```
create-ticket/{desktop,tablet,mobile}.png
my-tickets/{desktop,tablet,mobile}.png
ticket-detail/{desktop,tablet,mobile}.png
```

**Populated 2026-09-06** by `e2e/lab-02/requester-ticket-flow.spec.ts`, run for real. The Playwright
*browser binary* download (`npx playwright install chromium`) is still blocked in this sandbox
(network restriction on the download host, confirmed against two mirrors) — worked around by
pointing `playwright.config.ts` at the system's already-installed Microsoft Edge instead
(`channel: 'msedge'`), which needs no additional download at all.

Two real bugs surfaced (and were fixed, not just noted) writing the spec itself: each Playwright
`test()` gets a fresh browser context, so a first attempt split across separate `test()` blocks per
screenshot lost the selected-Requester `localStorage` value between them — fixed by doing the whole
capture in one continuous test. Second, the desktop table and mobile card both exist in the DOM
simultaneously (only one is `display:none` per breakpoint), so a plain `.first()` locator could
resolve to the hidden one depending on viewport — fixed with an explicit `visible=true` filter.

To regenerate: start `server` and `client` (`npm run dev` in each), then from the repo root:

```powershell
npx playwright test
```
