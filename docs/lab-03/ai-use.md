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
| Standing rule: never post as me | "อย่าตอบนะแค่ร่างให้ผมตอบเองแล้ว merge" (given earlier in the same session, during Lab 2 review) | After this, the agent drafted by default and acted on GitHub only when I asked for that specific step in the same message (for example opening the Lab 2 evidence release PR #36). It never merged anything, and `reviewer.md` was filled only from the real PRs, never from memory. I want the review conversation to be mine, because it is graded as mine. |
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

> **Who wrote this section.** At my request, this reflection is written by the AI agent (Claude Code, Claude Opus 5.5) in its own words, from the record of the sprint: the commits, the PRs and the review files. It is not my own prose, and I am stating that openly instead of presenting it as mine. I read it before submitting. The decisions listed at the end are mine.

**As a specification agent (written by the agent).** I wrote the four Lab 3 documents before any code, and they were most useful where I argued with my own first draft. The clearest case is the last-active-Administrator rule: as first written it could not be tested, until I worked out that through the API it can only break when two admins remove each other at the same moment. It became a row lock plus a planned race test. But the spec also had gaps I did not see while writing it. Business rules BR-26 (an Internal Note moves `updatedAt`) and BR-32 (Requesters never see notes) each pass their own tests, yet together they let a Requester notice that IT wrote something private, because `updatedAt` is in the Requester response. The spec also never said what happens when IT Staff who own open tickets are changed to Requester, and the first migration assumes no two Lab 2 emails differ only in letter case.

**How those gaps were actually found.** Not by an independent human reviewer, and the record should say so. For every PR, the student asked me for an *anticipated review*: a draft written as if the peer reviewer, Jakkarin, were reviewing it, checked against the real branch. Those drafts are where the gaps above were first written down. The review comments later posted on PRs #47, #48, #53 and #54 match those drafts word for word. So the honest lesson is narrower than "a second person checks the spec against the world": the same agent, given a different job (attack this PR instead of build it), found contradictions it had written itself. That second pass was valuable, but it was not independent. A human reviewer who reads the code with their own questions would still have been a stronger check, and that is what peer review in this lab is meant to be.

**As a coding agent.** The student trusted my work more when I showed evidence instead of saying "done": a test run red before the code existed, row counts before and after a migration, and a race test that fails again when the lock is removed on purpose. The best example is the migration: Prisma's generated SQL would have dropped every ticket's status and priority, and I wrote conversions by hand instead. My weak spots were where I wrote code and tests together (L3-2, admitted in that PR's notes), and the limits of my own tests: every suite was green while the anticipated reviews still found real problems, including a Login focus bug that no test checked until one was added. Green tests prove what was thought of, not what was missed.

**What should be done differently.** Put the boundaries in the first prompt (local only, what a "preview" is, which authentication design) instead of waiting for the agent to ask. Read each spec section against the other sections, not only against the labsheet. Keep AI-drafted review text clearly separate from what a human reviewer writes, so the peer-review record shows who found what.

**What stayed mine (the student's).** I chose the authentication design, released the Lab 2 evidence commits to `main` first, decided where and when each PR was pushed and merged, and accepted the open review findings as documented limitations (`tests.md` §7.2) instead of changing endpoints that had already been merged. I asked for this reflection to be written in the agent's words rather than passed off as mine. The final test run on `main` (`tests.md` §6) is kept as Part 3 evidence, because "the agent said it passes" is not evidence.
