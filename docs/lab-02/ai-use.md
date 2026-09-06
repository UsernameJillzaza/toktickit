# Lab 2 — AI Use and Reflection

I used Claude Code (Sonnet 5) as the AI specification agent and AI coding agent for this sprint, at
default thinking effort, working directly in this repository and in a companion Obsidian vault
where the Phase 2 spec documents were drafted before being moved here.

## Selected key prompts

| Prompt Name | Actual Prompt Text | My Reflection |
| --- | --- | --- |
| Kick off Phase 2 spec drafting | "เริ่มเลย" (after choosing Ticket Number format, localStorage persistence, pagination limits, and attachment storage as the four open design decisions) | A one-word prompt worked because the four decisions were already pinned down first via a structured question. Constraining the ambiguous points before saying "go" kept the agent from inventing answers I hadn't actually approved. |
| Push back on fabricated peer review content | "แก้ wording แล้วตอบ jakkarin ไปเลย" (after I flagged that a review referenced files/models that don't exist in this repo) | The agent caught something I might not have noticed myself — that a reviewer comment cited a `RequesterUser` model and `{ data: [...] }` envelope that were never in my `specification.md`. Having it verify claims against `git show` before accepting them, rather than trusting review text at face value, was the most useful check all sprint. |
| Refuse to fabricate a peer review | "เขียน review peer กุจะไม่ส่งให้ jakkarin ละ แต่กุจะใช้วัดกับที่ jakkarin เขียนมาแทน" | The agent had already refused (correctly) to draft review content meant to be posted as someone else's words on a graded PR, even after I pushed back twice. It agreed once the purpose changed to a private comparison file, kept out of the repo. Good boundary — I wouldn't have wanted that precedent set for the rest of the sprint. |
| Implement an Issue end-to-end | "เริ่ม #16 เลย" / "เริ่ม #17 เลย" / "เริ่ม #18 เลย" (repeated per Issue, no further instruction) | Each one-line prompt produced a full Issue: schema migration, endpoint, tests, a client screen, manual browser verification, then a PR with a reviewer's guide. The pattern that made this work was established once (branch → implement → test → verify in browser → PR) and then just repeated — I didn't have to re-explain the workflow every time. |
| Request a real regression check | (implicit — the agent ran the full suite in a loop after finding flaky tests in Issue #17, unprompted) | Two tests were comparing global `prisma.ticket.count()` before/after, which broke once a second test file started inserting fixtures concurrently. The agent ran the suite 10-15 times in a loop to confirm the fix actually held rather than trusting one green run — that's the kind of check I wouldn't have thought to ask for explicitly. |
| Push responsive/visual polish for Issue #19 | "เริ่ม #19 เลย" | This is the prompt that caught real bugs rather than confirming existing work: the mobile nav overlapped illegibly, My Tickets required horizontal scrolling on phones instead of switching to cards, and the whole app was using stock Bootstrap colors instead of the Zen Green hex values from my own `ui-spec.md`. All three were found by actually resizing the browser and reading the rendered page, not by inspecting the CSS in the abstract. |
| Handle a genuine environment limit honestly | (Playwright browser install failing) | Rather than silently skipping the Playwright deliverable, the agent retried against two hosts, confirmed the npm registry itself was reachable (ruling out general connectivity), and then asked me how to proceed instead of guessing. It still wrote the e2e spec file and did the responsive verification by hand in the meantime — the limitation didn't become an excuse to skip the actual QA work. |
| Draft reviewer.md from real data only | "ส่ง repo/PR link มาให้เลย" (asking me for the real GitHub links before writing anything) | The agent refused to draft `reviewer.md` from memory or invent PR numbers/quotes — it asked for the actual reciprocal-review repo link, then pulled real review bodies and comment threads via `gh api` before writing anything. Slower than just generating plausible-looking content, but the alternative would have been fabricating submission evidence. |

## Reflection on improving my prompts

The prompts that worked best were the ones where I'd already made a decision and just needed the
agent to execute it ("เริ่มเลย" after picking the four design decisions, "เริ่ม #16 เลย" once the
Issue breakdown was already agreed) — vague, open-ended prompts early in the sprint would have made
the agent guess at things like the Ticket Number format or the pagination limits, which are exactly
the choices the labsheet says are mine to make, not the AI's.

The other pattern worth naming: several of the most useful moments this sprint came from the agent
pushing back — refusing to write a review meant to be posted as someone else's words, or verifying
a reviewer's claims against the actual repository contents instead of accepting them. Prompting an
agent to "just do what I ask" isn't actually what produced the best work here; the sprint went
better where I let it flag when something looked wrong, even when that meant an uncomfortable
conversation about a peer's review quality.
