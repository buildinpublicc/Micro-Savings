# Micro-Savings API (scaffold)

Node + **Express** + **better-sqlite3** + **node-cron**. Auto-save ticks are **stubbed** (ledger rows only) until you connect a worker to Starkzap / chain.

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

- API: `http://localhost:3001`
- Health: `GET /api/health`

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness |
| `POST` | `/api/users` | Body `{ "externalRef": "cartridge-user-or-opaque-id" }` — create/find user |
| `GET` | `/api/users/:userId/plans` | List plans |
| `POST` | `/api/users/:userId/plans` | Body matches frontend `SavingsPlanPayload` (`amount`, `frequency`, `duration`, `autoConvert`, `earnYield`) |
| `POST` | `/api/internal/run-due` | Force-run due saves (no auth — lock down in prod) |

## Cron

`CRON_SCHEDULE` uses **5 fields** (minute hour day month weekday), **UTC**. Default: every 5 minutes.

Due plans: `active = 1` and `next_run_at <= now`. Each run appends a `ledger_events` row and advances `next_run_at` by frequency.

## Next steps

1. **Auth:** verify JWT / session on `/api/*`, map to `users.external_ref`.
2. **Worker:** replace stub in `src/jobs/runDueSaves.js` with a queue (BullMQ, pg-boss) and a process that calls your client or a signing service.
3. **Postgres:** swap SQLite for Neon/RDS + Drizzle/Prisma; keep the same tables.
4. **CORS:** set `CORS_ORIGIN` to your deployed web app origin(s).
