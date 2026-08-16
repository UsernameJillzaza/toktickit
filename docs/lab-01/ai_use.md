# Lab 1 — AI Use Log

Per the labsheet §14 Part 3. This is the submission copy; a fuller learning journal is kept in my course notes.

## Tool & Model

**Claude Code** (CLI), using Anthropic's Claude (primarily Opus, with Sonnet in earlier sessions). Used for planning, step mapping, implementation, subagent delegation, review-loop drafting, and documentation. I remained responsible for every command, merge, and human interaction.

## Selected Key Prompts

| # | Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|---|
| 1 | Explore & set up the vault | "I'm download my friend university work folder into this folder, i want you to explore it and setup to make my own" | One prompt did the full exploration and setup. No follow-up needed. |
| 2 | Track upstream updates | "nah just doing (a) i want to track update" | Fetched the GitHub API tree, diffed against local files, applied changes in one session. |
| 3 | Map Lab 1 steps | "we will keep doing as lab1 said never edit or overthink/guess so lets mapping at step of lab1 first" | Produced a structured map with no invented steps — matched the labsheet exactly. |
| 4 | Verify an AI-drafted Git workflow | Pasted a ChatGPT-written "Mandatory Git Workflow" + "so are your first understand is same to gpt said?" | Had Claude cross-check ChatGPT's draft against the labsheet; it caught that GPT used a local `git merge` where the lab mandates PRs + peer review (5 graded pts). Never trust one AI — verify against the source. |
| 5 | Run Phase 0 (repo, branches, Issues) | "last start phase 0" → "keep going" | Found the repo already existed (public + a double-nested clone), flattened it, cut `lab1-staging` from `main`, created the 4 Issues with exact spec wording, flipped to private. |
| 6 | Build the Project board | "build it" | Scripted the board via `gh` + GraphQL: the six required columns in order, Issues #1–#4 in Backlog. |
| 7 | Do Issue #1 (foundation) | "Continue CPE334 Lab 1, Issue #1 … verify node/npm, then plan Postgres install with me" | Claude checked and found Node was NOT actually installed despite my "I installed it"; installed Node 24 LTS, planned Postgres, scaffolded the full stack, fixed several TS7/Prisma7/npm11 breakages, verified every layer builds/tests/boots. |
| 8 | Do Issue #2 (health check) | "keep going" | Built test-first: wrote the Supertest test, watched it fail (404), then implemented `GET /api/health`. Added the Check System UI with loading/error states; verified success *and* failure paths in a real browser. |
| 9 | Fix out-of-order branching | Pointed out #2 was branched before #1 merged; then "keep going" | Claude had drafted my reply to a review but posted it under my account without asking — I caught it and switched to draft-only. Then re-cut #2's branch cleanly off updated staging. Lesson: an agent must never speak as me to someone else without my sign-off. |
| 10 | Catch an over-strict rule, build #3 | "อ่าน claude.md กับ Lab1_Guidance.md สิ … pull request issue 2 แล้วแต่ 3 ยังไม่เริ่มรู้สึกแปลกๆ" | My "feels off" was right — Claude's own rule was stricter than §7 (which lets #2/#3 run in parallel). Corrected it, then built #3 (model + migration + idempotent seed), fixing two real Prisma 7 breaking changes by reading the actual errors. |
| 11 | Build #4 with a deliberate flaw | "in #4 i want to make some part that need to fix after pull request (ALL This for git and team flow learning)" | **Intentional exercise (disclosed):** built #4 correct except a planted `orderBy` gap so I could practice the Fixing loop §14 grades. Reviewer requested changes → I fixed `orderBy` + strengthened the test → re-review → approved → merged. Produced real request-changes → fix → response evidence. |

### Subagent prompts

| # | Called from | Task | Actual prompt (summary) | Result |
|---|---|---|---|---|
| S1 | `/update-index CPE334` | Transcribe `Lab1_Glossary.pdf` — a 3-column table `pdftotext` scrambled | "Read the PDF … glossary table with columns Area \| Term \| What it means … rebuild the correct mapping … render as a proper Markdown table … keep every term and definition; do not summarize or invent." | 28 terms across 6 areas correctly matched. |

## Reflection on improving my prompts

- **Cross-checking AIs:** I drafted the Git workflow with ChatGPT, then had Claude verify it against the labsheet — which caught a real 5-point gap (local merge vs. required PRs). Two AIs checking each other beat trusting either one.
- **Verify, don't trust:** "I installed Node" turned out to be false; the agent checked before building on it. Same discipline kept my DB password in `.env` only — the agent never handled the credential.
- **Newer-than-training tooling:** the stack pulled TypeScript 7, Prisma 7, npm 11 — the agent adapted by reading the actual error messages rather than guessing, and re-verified after each fix.
- **AI-composed messages need my sign-off:** the agent once posted a review reply under my account before I approved it. Peer review is a real conversation — from then on, all messages to my partner were draft-only for me to post.
- **A green test can still be worthless:** in #4, `toContain` passed while guaranteeing nothing about order; switching to `toEqual([...])` tied the test to the actual contract. Presence ≠ correctness.
