# Job Scanner — Session Handoff

**Last updated:** 2026-07-06 (end of Phase 1 session)
**Read this first when resuming work on this project.**

## Where things stand

Phase 1 (Foundation) is **complete, reviewed, and merged to `main`** (merge commit `d53dc51`, pushed to origin). The app works end-to-end: sign up → protected dashboard → sign out → sign in; `/api/health` returns 200/503; 11/11 tests green (run sequentially); lint/typecheck/build clean; CI workflow in place (first run fires on PR or push to main — the merge push should have triggered it; verify at https://github.com/nagendra571/JobScanner/actions).

Stack: Next.js 15 + TypeScript (strict), Postgres 16 (Docker Compose), Drizzle ORM, Auth.js v5 (credentials + optional Google, JWT sessions, edge-safe split config), pino, Zod v4, Vitest, GitHub Actions.

## Key documents (in priority order)

1. `docs/superpowers/specs/2026-07-05-job-scanner-design.md` — the approved product/architecture spec (all 6 phases).
2. `docs/superpowers/plans/2026-07-05-phase-1-foundation.md` — Phase 1 plan (done).
3. `.git/sdd/progress.md` — task-by-task execution ledger with review outcomes (note: lives in `.git/`, not pushed).
4. `.git/sdd/task-N-{brief,report}.md` — per-task briefs and implementer reports (local only).
5. `README.md` — developer onboarding (verified accurate).

## FIRST: outstanding fixes from the final whole-branch review

The final review verdict was "With fixes", but the branch was merged before the fixes were applied. Apply these on `main` (or a small fix branch) before starting Phase 2:

**Important (dormant runtime break / data-loss footgun):**
1. `src/auth.ts` — `DrizzleAdapter(db)` uses default singular table names; our tables are plural. Google OAuth will crash with `relation "user" does not exist` the moment it's configured. Fix: `DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens })` with the schema imports.
2. `tests/setup.ts` — if `.env.test` is missing, tests fall back to `.env.local` and `truncate table users cascade` hits the DEV database. Fix: after loading env, throw unless `new URL(process.env.DATABASE_URL!).pathname` ends with `_test`.

**Trivial trio:**
3. `package.json` — add `"engines": { "node": ">=20" }`.
4. `src/app/layout.tsx` — metadata still says "Create Next App"; set real title/description.
5. `README.md` — delete the now-redundant "## Development" forward-reference line above "Getting started".

**Deferred to Phase 2+ (recorded, do not lose):**
- Google sign-in has no UI button (spec promises it; add button + OAuth E2E in Phase 2).
- CI runs `drizzle-kit push`, never the committed migrations — switch CI to `db:migrate` (or both).
- Test-suite scaling strategy needed before suite grows (per-worker DBs or per-test transactions; `fileParallelism: false` is the current stopgap).
- `isUniqueViolation` cause-chain: add cycle/depth guard + deterministic unit test when next touched.
- Health probe has no timeout (`connectionTimeoutMillis`); signup route doesn't require `content-type: application/json`; `authorize` has an email-existence timing oracle (dummy-hash compare if enumeration matters); `z.string().email()` → `z.email()` (Zod 4 idiom); untyped `body.error` in signup page.

## Next milestone: Phase 2 — Resume intake

Per the spec: upload to a storage abstraction (local disk dev / S3-compatible prod), PDF/DOCX text extraction, Claude-powered parsing to a structured profile schema (Zod-validated), profile review/edit UI, `resumes` table + migration, usage metering (`usage_events`). Write a Phase 2 plan first (superpowers:writing-plans) against the spec and the now-real codebase.

## Working agreements (user-established)

- **Model split:** Fable designs/plans/orchestrates; Sonnet subagents implement and review per task (superpowers:subagent-driven-development), most-capable model for final whole-branch reviews.
- **Configurability pattern:** job sources, LLM providers, tailoring aggressiveness are all pluggable/configurable with sensible defaults (Claude default LLM; aggregators default-on; scraper feature-flagged off; reframe-only tailoring default; NO fabrication mode — hard product rule).
- **Production-grade:** multi-user, Auth.js, Postgres, quotas/usage metering, observability. Billing out of v1 but seams kept.
- All app-runtime config through `getEnv()` (`src/lib/env.ts`); drizzle-kit configs and edge-safe `src/auth.config.ts` are the only exemptions.
- Emails lowercase; bcrypt cost 12; password hashes never leave `src/lib/services/`; every external input Zod-validated; routes thin (parse → service → respond); business logic in `src/lib/services/`.
- Commit style: conventional prefixes (feat/fix/ci/docs), one commit per task + fix commits.

## How to resume

Tell the agent:

> Read `docs/superpowers/HANDOFF.md` and follow it: apply the outstanding fixes first, then plan Phase 2 (resume intake) with superpowers:writing-plans from the spec, and execute it with superpowers:subagent-driven-development using Sonnet workers.
