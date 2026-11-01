# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk / issue-tracking web application built incrementally across CPE334 Labs 1–4. This repository holds the individual-sprint work.

**What works after Lab 4 (the finished application):** everything from Lab 3 below, plus **Actions Taken** under each ticket (IT Staff and Administrators record, edit, complete and cancel work; Requesters read it), the final **status rules** (a ticket can be Resolved only with a completed Action and no open one, and a status change from an out-of-date screen is refused), and a **Dashboard** for every role with numbers computed by the server and cards that open the matching list.

**After Lab 3:** real sign-in with session cookies and a password policy, a forced password change for initial passwords, three roles (Requester, IT Staff, Administrator) with role-based menus and server-side authorization, Requester ticketing from Lab 2 (create, list, detail, attachments) on the signed-in identity, an IT Staff Ticket Queue and Ticket Detail (claim / assign, IT Priority, status transitions, public comments, internal notes), and Administrator user management.

**Tech stack:** React + TypeScript + Vite + Bootstrap (frontend) → Node.js + Express + TypeScript (backend) → Prisma ORM → PostgreSQL. Tests with Vitest + Supertest + Testing Library, end-to-end with Playwright.

## Repository structure

```
toktickit/
├── client/                    React + TypeScript + Vite frontend (Bootstrap, Zen Green theme)
│   ├── src/auth/              sign-in, change password, session context, route guard
│   ├── src/staff/             IT Staff queue and ticket detail
│   ├── src/actions/           Actions Taken: staff panel and Requester list
│   ├── src/dashboard/         Requester and IT Staff / Administrator dashboards
│   ├── src/admin/             User Management
│   └── tests/lab-0{1,2,3,4}/  UI tests per lab
├── server/                    Node.js + Express + TypeScript backend
│   ├── prisma/                schema, migrations, seed (users, sample tickets, comments)
│   ├── src/auth/              passwords (scrypt), sessions, middleware, /api/auth
│   ├── src/staff/  src/admin/ /api/staff and /api/admin routers
│   ├── src/tickets/           status workflow, resolution gate, comments / notes
│   ├── src/actions/           Actions Taken API (/api/staff/tickets/:id/actions, /api/tickets/:id/actions)
│   ├── src/dashboard/         /api/dashboard/requester and /api/dashboard/staff
│   └── tests/lab-0{1,2,3,4}/  API, unit, migration and authorization tests per lab
├── e2e/lab-0{2,3,4}/          Playwright end-to-end suites
├── artifacts/lab-0{2,3,4}/    screenshot evidence captured by the E2E suites
├── docs/lab-0{1,2,3,4}/       specification, API / UI spec, test plan, reviewer, AI use
├── playwright.config.ts
└── README.md
```

## Prerequisites

- **Node.js** 20+ (developed on Node 24 LTS) and npm
- **PostgreSQL** 17 or newer (developed on 18), running locally on port 5432
- **Microsoft Edge** for the E2E suite (Playwright uses the installed Edge, see `playwright.config.ts`)

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/UsernameJillzaza/toktickit.git
cd toktickit

# Frontend
cd client && npm install && cd ..

# Backend
cd server && npm install && cd ..
```

### 2. Create the database

Using `psql` (or pgAdmin), create an empty database named `toktickit`:

```bash
psql -U postgres -c "CREATE DATABASE toktickit;"
```

### 3. Configure environment variables

The backend reads its database connection from `server/.env`. Copy the template and fill in your PostgreSQL password:

```bash
cd server
cp .env.example .env
# then edit .env and set your postgres password in DATABASE_URL
```

`server/.env` is gitignored and must never be committed. Only `server/.env.example` is tracked.

### 4. Initialize the database schema and seed data (Prisma)

```bash
cd server
npx prisma migrate deploy
npx prisma db seed
```

`migrate deploy` applies every committed migration in order (it also upgrades an existing Lab 2 or Lab 3 database in place — the Lab 3 migrations rename and extend tables rather than dropping them, and the Lab 4 migration only adds the `ActionTaken` table and its enum; nothing existing is altered or dropped). To check that the database matches the schema file afterwards, run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: it should print `No difference detected.` The seed is idempotent: run it as often as you like; it never duplicates rows and never resets a password a user has already changed. Besides the accounts below it adds 23 sample tickets across every status, priority and owner, plus a few public comments and internal notes, so the IT Staff screens have realistic data. Lab 4 adds 13 sample Actions Taken on those tickets (none, one and several per ticket; two finished tickets are left without Actions on purpose, as a Lab 3 ticket would be). The seed prints how many Actions were new and warns if one was skipped.

### 5. Local development accounts (seed data)

**These credentials exist only in your local development database. They are not real passwords and must never be reused anywhere else.**

| Role | Accounts | Password | First login |
| --- | --- | --- | --- |
| Requester | `pim.rattanakorn@toktickit.test` | `TokTick2026!` | goes straight in |
| Requester (carried over from Lab 2) | `jennifer.anderson@`, `michael.brown@`, `somchai.suksawat@`, `nattaya.chaiyaporn@` … `toktickit.test` | `Welcome2026!` | must choose a new password |
| Requester (inactive) | `david.wilson@toktickit.test` | `Welcome2026!` | cannot sign in |
| IT Staff | `arthit.wongsa@`, `siriporn.kaewmanee@`, `daniel.lee@` … `toktickit.test` | `TokTick2026!` | goes straight in |
| IT Staff (inactive) | `ploy.srisuk@toktickit.test` | `TokTick2026!` | cannot sign in |
| Administrator | `napat.chaiwong@`, `kanya.thongdee@` … `toktickit.test` | `TokTick2026!` | goes straight in |

Passwords are stored only as scrypt hashes. Sessions are an `HttpOnly` cookie backed by the `Session` table (8-hour lifetime).

## Running the app

Open two terminals:

```bash
# Terminal 1 — backend API (http://localhost:3000)
cd server && npm run dev
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd client && npm run dev
```

## Running tests

```bash
# Backend: unit, API, migration and authorization tests (Vitest + Supertest)
cd server && npm test

# Frontend UI tests (Vitest + Testing Library)
cd client && npm test

# End-to-end (Playwright) — starts the API and the dev server itself if they aren't running
npx playwright test
```

The server and E2E suites use the local database from steps 2–4 (migrated and seeded). They create their own users and tickets and delete them afterwards, so the seed data is left as it was. The Lab 4 test plan, traceability and final results are in [`docs/lab-04/tests.md`](docs/lab-04/tests.md) (Lab 3's are in [`docs/lab-03/tests.md`](docs/lab-03/tests.md)). The E2E suite writes its screenshots into `artifacts/lab-0N/screenshots/`; they are committed as evidence, so run `git checkout -- artifacts` afterwards if you do not want to replace them.

If you run the E2E suite, do not start a second run while one is still going: the runs share the database and the dev servers, and an interrupted run can leave test users named `e2e-…@lab3.test` behind (they make later runs fail on a duplicate name). Delete those users and run again.

## Git workflow

All work happens on `feature/*` branches, integrated into the lab's staging branch (`lab3-staging` for Lab 3, `lab4-staging` for Lab 4) through peer-reviewed Pull Requests, and released to `main` via a staging → main PR. Feature branches are never merged directly into `main`. Reviewer details per lab are in `docs/lab-0N/reviewer.md` — for Lab 3, [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md); for Lab 4, [`docs/lab-04/reviewer.md`](docs/lab-04/reviewer.md). How AI was used is in `docs/lab-0N/ai-use.md`.

## Demonstration (what to click)

After the setup above, with both servers running, open <http://localhost:5173> and sign in with the accounts in step 5. Every role lands on its **Dashboard**.

1. **Requester** (`pim.rattanakorn@toktickit.test`): the Dashboard shows *Open tickets*, *Waiting for you* and *Resolved (last 30 days)*; each "View" link opens My Tickets with that filter shown as a chip and the number of tickets, which equals the card. Open a ticket: "Actions taken" lists the work done, read-only.
2. **IT Staff** (`arthit.wongsa@toktickit.test`): the Dashboard shows *Unassigned*, *Assigned to me*, *Requester reports resolved*, the counts by status and by IT priority, and the Urgent, Recently updated and My recent actions lists. Open a ticket from the queue, **Claim** it, then in "Actions taken" press **New action**, save it, then **Complete** it with a result. Try to change the status to **Resolved** before any Action is completed: the screen explains why it cannot, and the server refuses it too.
3. **Administrator** (`napat.chaiwong@toktickit.test`): the same Dashboard plus the *Users* card (counts by role), linking to User Management.

The REST contract of the new endpoints is in [`docs/lab-04/api-spec.md`](docs/lab-04/api-spec.md), the business rules in [`docs/lab-04/specification.md`](docs/lab-04/specification.md).
