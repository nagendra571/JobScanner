# Job Scanner

Upload a resume, scan the job market for matching postings, tailor your
resume to a selected job with honest accept/reject suggestions, export,
and track applications.

- Spec: `docs/superpowers/specs/2026-07-05-job-scanner-design.md`
- Plans: `docs/superpowers/plans/`

## Development

See "Getting started" in this file after Phase 1 Task 10.

## Getting started

Prereqs: Node 20+, Docker Desktop.

1. `npm install`
2. `docker compose up -d` — starts Postgres (dev db `jobscanner`, test db `jobscanner_test`)
3. Copy `.env.example` to `.env.local`, set `AUTH_SECRET` (32+ random chars)
4. Create `.env.test` with `DATABASE_URL` pointing at `jobscanner_test` and any `AUTH_SECRET`
5. `npm run db:migrate` — apply migrations; `npm run db:push:test` — sync test db
6. `npm run dev` — app at http://localhost:3000; health at /api/health

## Scripts

- `npm test` / `npm run test:watch` — Vitest (integration tests hit `jobscanner_test`)
- `npm run db:generate` — create a migration from schema changes
- `npm run lint` / `npm run typecheck`
