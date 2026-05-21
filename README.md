# MITS Consulting Hub — Full-stack

Full-stack rebuild of `mits-consulting-hub.html` (single-page CRM) as a production-ready application.

## Stack

| Layer       | Tech                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| Frontend    | Vite + React 18 + TypeScript, Tailwind CSS, shadcn-style UI, Zustand, React Query, axios |
| Backend     | Node.js + Express + TypeScript, JWT auth (cookie + bearer), bcrypt, Zod               |
| Database    | PostgreSQL + Prisma ORM                                                                |
| Deploy      | Render.com (Postgres + Node web service + Static site)                                |

The frontend and backend live in **separate top-level folders** (`frontend/`, `backend/`) and are deployed as independent services on Render.

---

## Local development

### 1. Postgres

Either:

- Use a hosted Postgres (Render, Neon, Supabase free tier), or
- Run locally: `brew install postgresql && brew services start postgresql && createdb mits`

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Backend runs on `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` (proxies `/api` to backend).

### 4. Login

Seeded users (all share password `password123`):

| Email                 | Role               |
| --------------------- | ------------------ |
| `vaibhav@mits.local`  | founder            |
| `samita@mits.local`   | demo_lead          |
| `anjali@mits.local`   | demo_intake        |
| `taran@mits.local`    | demo_intake        |
| `aman@mits.local`     | recruiter          |
| `kanchan@mits.local`  | recruiter          |
| `roshni@mits.local`   | sales_closer       |
| `mitali@mits.local`   | manager            |
| `bhavneet@mits.local` | lead               |
| `kashish@mits.local`  | staff              |
| `muskan@mits.local`   | staff              |
| `areena@mits.local`   | accounts           |
| `ashok@mits.local`    | accounts           |
| `malika@mits.local`   | payment_processor  |

---

## Deploying to Render

### Option A — Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select your repo. Render reads `render.yaml` and creates:
   - `mits-postgres` (Postgres database)
   - `mits-backend` (Node web service)
   - `mits-frontend` (Static site)
3. After services are created, set the two cross-service env vars in the dashboard:
   - `mits-backend` → `CLIENT_ORIGIN` = your frontend URL (e.g. `https://mits-frontend.onrender.com`)
   - `mits-frontend` → `VITE_API_URL` = your backend URL (e.g. `https://mits-backend.onrender.com`)
4. Trigger a redeploy of both.
5. Seed the database (one-time): in the backend service shell run `npm run seed`.

### Option B — Manual

1. Create a Postgres instance on Render.
2. Create a **Web Service** from `backend/`:
   - Build: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - Start: `npm start`
   - Env: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `PORT=10000`, `CLIENT_ORIGIN=<frontend url>`
3. Create a **Static Site** from `frontend/`:
   - Build: `npm install && npm run build`
   - Publish: `dist`
   - Env: `VITE_API_URL=<backend url>`
   - Add rewrite rule `/* → /index.html` (SPA fallback).
4. Run `npm run seed` from the backend service shell.

---

## Project layout

```
mits-consulting/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── index.ts                 # Express bootstrap
│   │   ├── lib/                     # prisma, auth, audit helpers
│   │   ├── routes/                  # auth, clients, trainers, partners,
│   │   │                            #   sourcing, payments, tasks,
│   │   │                            #   sessionLogs, leverage, accounts,
│   │   │                            #   feedback, payouts, banks, audit,
│   │   │                            #   reports, templates, sources, flags,
│   │   │                            #   rawLeads, editRequests, metrics
│   │   └── seed/
│   │       └── index.ts             # idempotent seed (users, clients, trainers, …)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # routes
│   │   ├── main.tsx
│   │   ├── index.css                # Tailwind + tokens
│   │   ├── lib/                     # api (axios), utils (LIFECYCLE, helpers)
│   │   ├── store/                   # zustand (auth, ui)
│   │   ├── components/
│   │   │   ├── ui/                  # button, input, dialog, pill, avatar, toast
│   │   │   └── layout/              # AppLayout, Sidebar
│   │   └── pages/                   # 30+ pages — see App.tsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.ts
│   └── package.json
├── render.yaml
└── README.md
```

---

## API surface (all paths prefixed with `/api`)

| Path                                          | Notes                                       |
| --------------------------------------------- | ------------------------------------------- |
| `POST /auth/login` `POST /auth/register`      | JWT cookie + bearer                         |
| `GET /auth/me` `POST /auth/logout`            |                                             |
| `GET/POST/PATCH/DELETE /users`                | founder-only writes                         |
| `GET/POST/PATCH /clients` `POST /:id/stage`   | full CRUD + lifecycle transitions           |
| `GET/POST/PATCH /trainers`                    |                                             |
| `GET/POST/PATCH/DELETE /trainer-leads`        |                                             |
| `GET/POST/PATCH/DELETE /partners`             |                                             |
| `GET/POST/PATCH /sourcing` `POST /:id/proposals` `PATCH /proposal/:id` | recruiter flow + verification |
| `GET/POST/DELETE /payments`                   | role-restricted recording                   |
| `GET/POST/PATCH /tasks` `POST /:id/complete`  | auto-creates SessionLog                     |
| `GET/POST/PATCH /session-logs` `POST /bulk-status` |                                       |
| `GET/POST /leverage` `POST /:id/decision`     | auto-approve ≤ 3 days                       |
| `GET/POST/PATCH /accounts-queue`              |                                             |
| `GET/POST /feedback`                          |                                             |
| `GET/POST /payouts` `POST /:id/approve` `POST /:id/pay` | two-stage payout flow             |
| `GET/POST/PATCH /banks`                       |                                             |
| `GET /audit`                                  | founder only                                |
| `GET/POST /reports`                           | daily reports                               |
| `GET/POST/PATCH/DELETE /templates`            | email/whatsapp templates                    |
| `GET/POST/DELETE /sources`                    | configurable lead sources                   |
| `GET /flags` `PUT /:key`                      | feature flags                               |
| `GET/POST/PATCH/DELETE /raw-leads` `POST /:id/promote` `POST /bulk` | messy lead intake     |
| `GET/POST /edit-requests` `POST /:id/approve` `/reject`             | edit approval flow    |
| `GET /metrics/home` `GET /metrics/pipeline` `GET /metrics/money-flow` | dashboard stats       |

---

## What's preserved from the original HTML

- Same dark-theme visual design (page bg, sidebar, cards, pills, kpi blocks)
- Same lifecycle stages (Lead → IntakeSent → … → Active → LeverageGranted → Hold)
- Same role hierarchy (founder, demo_lead, demo_intake, recruiter, sales_closer, manager, lead, staff, accounts, payment_processor)
- Same intake 8-field structure, same bank accounts, same trainer pool, same lead sources
- Same workflows: lead → intake → sourcing → multi-proposal → verification → demo → sale close → fresh payment → active → renewals → trainer payouts → audit

## What's better than the original

- Multi-user with persistent Postgres (no `localStorage`)
- Real authentication (JWT + bcrypt)
- Role-based authorization enforced on the server
- Audit log saved server-side for every mutation
- Cross-device, multi-tab safe
- Deployable
