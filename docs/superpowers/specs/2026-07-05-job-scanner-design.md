# Job Scanner — Design Specification (Production-Grade)

**Date:** 2026-07-05
**Status:** Approved
**Scope:** Production-level, multi-user web application (not a personal tool or MVP).

## Overview

Job Scanner is a web application where a user uploads a resume, the system extracts a structured profile, scans the job market across configurable sources for matching postings with rich filtering, and — when the user selects a job — tailors the resume to that posting through a side-by-side accept/reject review, exports the result, and tracks the application through a pipeline board.

## Approved Decisions

- **Job data:** configurable multi-source — aggregator APIs (default on) + paste-a-URL + scraping (feature-flagged, OFF in production due to ToS/legal risk).
- **AI:** pluggable LLM providers, Claude API default.
- **Tailoring:** side-by-side accept/reject diff; aggressiveness configurable per user (Reframe-only default, User-confirmed-additions max; **no fabrication mode exists**).
- **Stack:** Next.js + TypeScript, PostgreSQL, Auth.js, pg-boss background queue.
- **V1 scope:** full core loop through tailored export **plus** application tracker. Billing is out of v1 but left as a clean seam (usage metering is in).

## User Journey

1. **Sign up / sign in** (email+password and Google OAuth).
2. **Upload** resume (PDF/DOCX) → text extraction → LLM parses to structured profile (contact, summary, skills, experience[], education[], certifications) → user reviews/corrects the extracted profile once. Multiple resumes per user supported.
3. **Scan** — user triggers scan (adjustable criteria: title keywords, location, remote) → scan runs as a background job querying all enabled sources in parallel → results normalized, de-duplicated (hash on company+title+location), match-scored, stored per user → jobs page shows progress, then renders from DB so filters are instant.
4. **Tailor** — user opens a job → LLM extracts requirements, compares to profile → side-by-side original vs. tailored resume; each change (rewritten bullet, added keyword, reordered skills) individually accept/reject-able → **Gaps panel** lists requirements the resume genuinely lacks.
5. **Export** — approved version exported as DOCX and PDF; the exact tailored version is persisted and linked to the job.
6. **Track** — pipeline board: Saved → Applied → Interviewing → Offer / Rejected; notes per application; card links to the tailored resume version used.

## Architecture

- **Next.js (App Router) + TypeScript** app; React UI + API routes/server actions.
- **PostgreSQL via Drizzle ORM** (local dev via Docker Compose; production on managed Postgres, e.g. Neon/RDS).
- **Auth.js (NextAuth v5)** — email/password + Google OAuth; all data scoped by `userId`; middleware-enforced session checks.
- **Background jobs via pg-boss** (Postgres-backed queue — no extra Redis infra): scan jobs, resume parsing, export generation. UI polls/streams job status.
- **File storage abstraction** — local disk in dev, S3-compatible (S3/R2) in production, behind one interface.
- **Service layer** (`src/lib/services/`) holds all scan/parse/tailor/export logic, independent of routes and queue — single source of truth callable from API routes, server actions, and workers.
- **Two plugin registries:**
  - **Job source providers** — interface `search(criteria) → NormalizedJob[]`; V1: JSearch (RapidAPI), Adzuna, Paste-a-URL/description. Scraper exists behind a feature flag, default OFF in production. **Platform-managed API keys** (admin-configured via env/secret store), not per-user keys. Per-user toggles select which enabled sources a scan uses.
  - **LLM providers** — interface with `parseResume`, `extractJobRequirements`, `tailorResume`; V1 ships Claude (default); interface accommodates OpenAI/Ollama later. Platform API key; per-user usage metering.

## Data Model (Drizzle tables, all user-scoped where applicable)

- `users`, `accounts`, `sessions` — Auth.js standard tables.
- `resumes` — userId, stored file reference, extracted raw text, structured profile JSON, timestamps.
- `jobs` — userId, title, company, location, remoteType, salaryMin/Max, employmentType, seniority, description, source, url, postedAt, matchScore, dedupHash.
- `scans` — userId, criteria, status (queued/running/partial/complete/failed), per-source results/errors JSON, timestamps.
- `tailored_resumes` — userId, jobId, resumeId, changes JSON (with accept/reject state), final document JSON, exported file references.
- `applications` — userId, jobId, status enum, notes, tailoredResumeId, timestamps.
- `user_settings` — source toggles, tailoring aggressiveness, default search criteria.
- `usage_events` — userId, operation (parse/tailor/scan), token counts, cost — feeds quotas now, billing later.

## Matching & Filters

- Match score computed **locally and deterministically**: skill/keyword overlap between profile and job description, weighted by requirement emphasis (terms in title/requirements weigh more). Zero LLM tokens at scan time; LLM spent only on jobs the user opens.
- Filters (instant, against DB): keyword, location, remote/hybrid/onsite, salary range, date posted, employment type, seniority, company, source, minimum match score.

## Tailoring Rules

- Per-user aggressiveness setting: **Reframe-only (default)** — rewrite only what's genuinely in the resume using the job's vocabulary; **User-confirmed additions** — may propose a missing skill but requires explicit "I actually have this" confirmation before it enters the document.
- No fabrication mode. Missing requirements always go to the Gaps panel, never silently into the resume.
- LLM outputs schema-validated with Zod; one retry on malformed output.

## Production Hardening (in scope for v1)

- **Security:** all routes auth-guarded; per-user data isolation enforced in the service layer (every query filtered by userId); secrets only in env/secret store; upload validation (type/size/content sniffing); OWASP-basics review (CSRF via Auth.js, input validation with Zod everywhere).
- **Rate limiting & quotas:** per-user limits on scans/day and LLM tokens/day (backed by `usage_events`), returning clear "quota reached" UI states.
- **Observability:** structured logging (pino), request IDs, Sentry-compatible error reporting hook, `/api/health` check.
- **Resilience:** provider isolation (one failing source → per-source warning, others return; scan status "partial"); timeouts and typed error results on all external calls; queue retries with backoff.
- **CI/CD:** GitHub Actions — lint, typecheck, unit/integration tests, build, Playwright e2e on PRs.
- **Deployment:** Dockerfile + docker-compose (app, Postgres, worker) as the reference deployment; compatible with Vercel + Neon + S3 as managed alternative.

## Testing Strategy

- Unit: normalization, dedup, match scoring, diff generation, quota logic (the deterministic core).
- Integration: service layer against a test Postgres (Testcontainers or docker-compose test DB); provider adapters against recorded fixtures.
- E2E: Playwright covering the full loop with mocked external APIs (sign in → upload → scan → filter → tailor → export → track).
- LLM provider mocked in tests; Zod schemas validated against fixture outputs.

## Implementation Phases (each ends with a deployable, usable app)

1. **Foundation** — Next.js + TypeScript scaffold, Docker Compose (Postgres), Drizzle migrations, Auth.js sign-up/sign-in, CI pipeline, health check, logging.
2. **Resume intake** — upload to storage abstraction, PDF/DOCX text extraction (pdf extraction + mammoth), Claude parsing to profile schema, profile review/edit UI, usage metering.
3. **Job scanning** — pg-boss worker, JSearch + Adzuna adapters, paste-a-URL ingestion, normalization/dedup/match-scoring services, scan status UI, jobs page with full filter set, rate limits/quotas.
4. **Tailoring & export** — requirement extraction, tailoring engine honoring aggressiveness setting, side-by-side accept/reject diff UI, Gaps panel, DOCX (`docx` package) + PDF export via storage abstraction.
5. **Tracker** — pipeline board with status transitions, notes, tailored-resume links.
6. **Production hardening pass** — Sentry hook, Playwright e2e suite, security review, deployment docs, seed/demo script.

## Acceptance Criteria

- Full-loop: two separate user accounts show complete data isolation; upload resume → scan with ≥2 sources → filter → tailor → accept/reject → export DOCX/PDF → move application through board.
- Provider failure drill: invalid API key on one source → scan completes "partial" with per-source warning.
- Quota drill: exhausting a test user's daily LLM quota shows a clear quota-reached UI with no further LLM spend.
