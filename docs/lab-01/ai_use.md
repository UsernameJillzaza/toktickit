# Lab 1 — AI Use Log

Per the labsheet §14 Part 3. This is the submission copy; the working draft is maintained alongside a learning journal in the course vault and synced here before submission.

## Tool & Model

**Claude Code** (CLI) — Anthropic Claude. Used for planning, step mapping, implementation, subagent delegation, and documentation.

## Selected Key Prompts

| # | Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|---|
| 1 | Explore & set up friend's vault | "I'm download my friend university work folder into this folder, i want you to explore it and setup to make my own (continues in this folder)" | One prompt did the full exploration and setup. No follow-up needed. |
| 2 | Track upstream updates | "nah just doing (a) i want to track update" | Claude fetched the GitHub API tree, diffed it against local files, and applied all upstream changes in one session. |
| 3 | Map Lab 1 steps | "we will keep doing as lab1 said never edit or overthink/guess so lets mapping at step of lab1 first" | Produced a structured map with no invented steps — matched the labsheet exactly. |
| 4 | Collect all prompts incl. subagent prompts | "yeah but we need to collect all prompting including prompt that u tell subagent" | Created this log plus a learning journal. |
| 5 | Verify an AI-drafted Git workflow against the spec | Pasted a ChatGPT-written "Mandatory Git Workflow" doc + "so are your first understand is same to gpt said?" | Used ChatGPT to draft the workflow, then had Claude cross-check it against the labsheet. Claude caught that GPT described a local `git merge` where the lab mandates GitHub PRs + peer review (5 graded pts). Lesson: verify one AI against the source of truth. |
| 6 | Run Phase 0 (repo, branches, Issues) | "last start phase 0" → "keep going" | Claude checked tooling, found the repo already existed (public + a double-nested clone), flattened it, cut `lab1-staging` from `main`, created the 4 Issues via `gh` with exact spec wording, and flipped the repo to private. |
| 7 | Build the Project board | "build it" → (after granting `project` scope) "Authorized" | Claude scripted the whole board via `gh` + GraphQL: created the project, set the six required columns in order, added Issues #1–#4, and set them all to Backlog. |
| 8 | Do Issue #1 (project foundation) | "Continue CPE334 Lab 1, Issue #1 … verify node/npm, then plan Postgres install with me, then move Issue #1 from Backlog to Specified and start." | Claude found Node was NOT actually installed (despite a prior install attempt), installed Node 24 LTS via winget, planned the PostgreSQL install, moved Issue #1 Backlog → Specified → Started, and scaffolded the client + server + Prisma + tests. |

### Subagent prompts

| # | Called from | Subagent task | Actual prompt (summary) | Result |
|---|---|---|---|---|
| S1 | `/update-index CPE334` | Transcribe `Lab1_Glossary.pdf` — a 3-column table that `pdftotext` scrambled | "Read the PDF … glossary table with columns Area \| Term \| What it means … rebuild the correct mapping … render as a proper Markdown table … keep every term and definition; do not summarize or invent." | 28 terms across 6 areas correctly matched. |

## Reflection (drafted, expand after lab)

- Cross-checking AIs: drafting the Git workflow with ChatGPT then verifying with Claude against the labsheet caught a real 5-point gap (local merge vs. required PRs).
- Security habit: accidentally pasted a GitHub token into chat and had to revoke it immediately — reinforcing the rule the lab grades (secrets stay in `.env`, never in chat or commits).
- Tooling reality-check: "I installed Node" did not mean Node was on PATH — Claude verified before trusting it, which is the whole point of the AI-as-accountable-junior model.
