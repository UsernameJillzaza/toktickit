# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk / issue-tracking web application built incrementally across CPE334 Labs 1–4. This repository holds the individual-sprint work: a full-stack vertical slice proving the technology stack works end to end.

**Tech stack:** React + TypeScript + Vite + Bootstrap (frontend) → Node.js + Express + TypeScript (backend) → Prisma ORM → PostgreSQL. Tests with Vitest + Supertest.

## Repository structure

```
toktickit/
├── client/                 React + TypeScript + Vite frontend (Bootstrap)
├── server/                 Node.js + Express + TypeScript backend
│   ├── prisma/             Prisma schema and migrations
│   ├── src/                API source (app.ts, server.ts)
│   └── tests/lab-01/       Supertest API tests
├── docs/lab-01/            Lab 1 documentation (ai_use, reviewer, tests)
├── .gitignore
└── README.md
```

## Prerequisites

- **Node.js** 20+ (developed on Node 24 LTS) and npm
- **PostgreSQL** 17, running locally on port 5432

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

`migrate deploy` applies every committed migration in order (it also upgrades an existing Lab 2 database in place — the Lab 3 migrations rename and extend tables rather than dropping them). The seed is idempotent: run it as often as you like; it never duplicates rows and never resets a password a user has already changed.

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
# Backend API tests (Supertest + Vitest)
cd server && npm test

# Frontend UI tests (Vitest + Testing Library)
cd client && npm test
```

## Git workflow

All work happens on `feature/*` branches, integrated into `lab1-staging` through peer-reviewed Pull Requests, and released to `main` via a staging → main PR. Feature branches are never merged directly into `main`. Reviewer details are in [`docs/lab-01/reviewer.md`](docs/lab-01/reviewer.md).
