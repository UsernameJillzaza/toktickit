# Lab 3 — AI Use and Reflection

I used **Claude Code with Claude Opus 5.5** (Anthropic), in the Claude desktop app, as both the AI specification agent and the AI coding agent for Lab 3. The same session drafted the four specification documents first (L3-1), then implemented L3-2 to L3-10 against them, working directly in this repository. Pull-request descriptions were drafted into a separate notes folder for me to review and post myself.

## Selected key prompts

Every prompt below is quoted exactly as I typed it. Thai prompts are kept in Thai.

| Prompt name | Actual prompt text | What happened / my reflection |
| --- | --- | --- |
| Kick off the whole sprint | "prepare everything in lab3 in local including preview draft for all PR" | One sentence, but it hid several decisions: what "preview" meant, whether GitHub could be touched, and how login should work. The agent asked about exactly those three before writing anything, instead of guessing. That mattered, because the labsheet says these are my decisions, not the AI's. |
| Define "preview" | "PR description + self-review checklist" (my answer to the agent's question) | This turned each PR into two parts: text I can paste, and a private checklist of what a reviewer might question (for example, an honest note that L3-2's tests were written alongside the code, not test-first). The checklists are the part I would not have written myself. |
| Keep everything local | "เราตอนนี้เราเตรียมใน local ไม่แตะ github ทำรวดเดียวไปเลย เพราะ jakkarin ยังไม่ว่าง" | A hard boundary: no pushes, no Issues, no PRs. The agent built all ten branches as one linear local chain and kept checking it hadn't set an upstream by accident; it found `lab3-staging` auto-tracking the Lab 2 branch and unset it. "Do it in one go" didn't mean skipping steps: each PR still has small commits that each pass the tests on their own. |
| Choose the authentication design | "Session ใน Postgres + httpOnly cookie (Recommended)" (chosen from the agent's options) | The agent explained the trade-off (an HttpOnly cookie can't be read by JavaScript, and a database session can be revoked immediately, which deactivation and "set new initial password" need). It wrote that into the spec as decisions before any code. Every later rule (deactivated users lose access on the next request) follows from this one choice. |
| Standing rule: never post as me | "อย่าตอบนะแค่ร่างให้ผมตอบเองแล้ว merge" (given earlier in the same session, during Lab 2 review) | After this, the agent only drafted. It never posted a comment, opened a PR or merged anything, and `reviewer.md` is left with explicit TODOs instead of invented review text. I want the review conversation to be mine, because it is graded as mine. |
| Correct a misunderstanding | "it not doing what i mean" (about how a previous session had worked) | This is why the Lab 3 kickoff started with clarifying questions rather than assumptions. A short complaint was enough to change the working style for the rest of the sprint. |
| Resume after a break | "im back lets continus" | The agent rebuilt its context from the repository (`git status`, branch, last commits) instead of trusting its memory, confirmed the working tree was clean, and carried on from the exact next step. |

## How the agent was used as a specification agent

- The spec (FR / BR / AC, the authorization matrix, the status transition matrix, migration decisions, issue decomposition) was written and committed in L3-1, **before** any implementation branch existed.
- The agent changed the spec when reality disagreed, in small, visible commits. Examples:
  - The last-admin rule was untestable as first written, so it was reframed as a race condition with a row lock.
  - The selector removal was moved into the Login PR.
  - The seed description was corrected to match what was built.
  - Two rule numbers it had cited wrongly (BR-41 for BR-42) were fixed.

## How the agent was used as a coding agent

- **Test-first** for almost every PR: tests were written and run red before the code existed. The one exception (L3-2) is admitted in that PR's notes instead of hidden.
- **Hand-written migrations:** Prisma wanted to `DROP` the old columns, which would have erased every Lab 2 ticket's status and priority. The agent wrote conversions instead and proved no data was lost (row counts before/after, empty drift check, database backup first).
- **Tests that test the tests:** for both locking rules, the agent removed the lock on purpose and confirmed the race test fails.
- **Tests caught real bugs, and they were fixed in their own commits:**
  - an IT-only field leaking to Requesters
  - a status choice being wiped on the staff screen
  - mobile buttons smaller than the spec's 44px

## My Reflection

> **DRAFT — rewrite this in my own words before submitting.** The points below are what I noticed; the graded reflection has to be mine.

- My best prompts were short only after the decisions were made. "prepare everything" worked because the agent turned it into three questions first. Next time I'll state the boundaries (local only, what "preview" means, the auth choice) in the first message.
- As a specification agent, it was most useful when it disagreed with the spec it wrote, for example finding that the last-admin rule couldn't be tested as written. A spec the agent never revisits would have been weaker.
- As a coding agent, I trusted it more because it showed proof instead of saying "done": the red test first, the green run, the row counts, the screenshots it looked at. When something failed (the race test first giving 401, the E2E flow failing), it treated it as information, not something to make pass.
- I stay accountable: I still have to read every diff, push, open the PRs, answer Jakkarin's review myself, and re-run the tests on `main` after merging.
