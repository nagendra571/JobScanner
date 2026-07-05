# Job Scanner Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the production skeleton of Job Scanner — Next.js + TypeScript app with Postgres (Docker), Drizzle migrations, Auth.js email/password + Google sign-in, structured logging, health check, tests, and CI — so every later phase builds on a deployable, authenticated base.

**Architecture:** Single Next.js App Router application. PostgreSQL via Drizzle ORM (Docker Compose locally). Auth.js v5 with JWT sessions, split edge-safe config for middleware. Business logic lives in `src/lib/services/` (framework-independent), routes stay thin.

**Tech Stack:** Next.js 15, TypeScript (strict), PostgreSQL 16, Drizzle ORM + drizzle-kit, Auth.js (next-auth v5 beta) + @auth/drizzle-adapter, bcryptjs, Zod, pino, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-05-job-scanner-design.md` (read it before starting).

## Global Constraints

- Node.js >= 20; npm as package manager.
- TypeScript `strict: true`; no `any` unless justified by a comment.
- Every external input (API request bodies, env vars) is Zod-validated.
- All business logic in `src/lib/services/` — API routes and server actions only parse input, call a service, shape the response.
- Secrets only via environment variables; `.env.local` and `.env.test` are gitignored; `.env.example` documents every variable.
- Emails are stored lowercase; passwords hashed with bcryptjs cost 12; password hashes never leave the service layer.
- Windows dev machine: no shell-specific env-var syntax in npm scripts (use config files that load dotenv instead).
- Commit after every task with the message given in the task.

---

### Task 1: Scaffold Next.js app with Vitest

**Files:**
- Create: entire Next.js scaffold at repo root (`package.json`, `src/app/*`, `tsconfig.json`, etc.)
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/smoke.test.ts`
- Create: `README.md` (replaces the 1-line placeholder)

**Interfaces:**
- Produces: `@/*` path alias to `src/*`; `npm run dev|build|lint|typecheck|test` scripts all later tasks use.

- [ ] **Step 1: Scaffold in place**

`create-next-app` refuses non-empty dirs but allowlists `.git`, `docs`, `LICENSE` — only `README.md` conflicts, so remove it first:

```bash
rm README.md
npx create-next-app@15 . --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Verify scaffold builds**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Add Vitest and test scripts**

```bash
npm install -D vitest dotenv
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

Create `tests/setup.ts`:

```ts
import { config } from "dotenv";

// Test env first (wins), then dev env as fallback for shared values.
config({ path: ".env.test" });
config({ path: ".env.local" });
```

Add to `package.json` `"scripts"`:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test and see it pass**

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Replace README**

Create `README.md`:

```markdown
# Job Scanner

Upload a resume, scan the job market for matching postings, tailor your
resume to a selected job with honest accept/reject suggestions, export,
and track applications.

- Spec: `docs/superpowers/specs/2026-07-05-job-scanner-design.md`
- Plans: `docs/superpowers/plans/`

## Development

See "Getting started" in this file after Phase 1 Task 10.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 app with Vitest harness"
```

---

### Task 2: Validated environment + structured logger

**Files:**
- Create: `src/lib/env.ts`, `src/lib/logger.ts`
- Create: `.env.example`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env` (throws on invalid env), `resetEnvCache(): void` (tests only), `logger` (pino instance). All later tasks read env exclusively through `getEnv()`.

- [ ] **Step 1: Write failing tests**

Create `tests/lib/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

const VALID = {
  DATABASE_URL: "postgres://jobscanner:jobscanner@localhost:5432/jobscanner",
  AUTH_SECRET: "x".repeat(32),
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = saved;
    resetEnvCache();
  }
}

describe("getEnv", () => {
  afterEach(resetEnvCache);

  it("returns parsed env when valid", () => {
    withEnv(VALID, () => {
      expect(getEnv().DATABASE_URL).toBe(VALID.DATABASE_URL);
    });
  });

  it("throws naming the missing variable", () => {
    withEnv({ ...VALID, AUTH_SECRET: undefined }, () => {
      expect(() => getEnv()).toThrow(/AUTH_SECRET/);
    });
  });

  it("rejects a short AUTH_SECRET", () => {
    withEnv({ ...VALID, AUTH_SECRET: "short" }, () => {
      expect(() => getEnv()).toThrow(/AUTH_SECRET/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/env`.

- [ ] **Step 3: Implement env and logger**

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid environment configuration — ${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test-only: clear memoized env between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
```

Create `src/lib/logger.ts`:

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: ["*.password", "*.passwordHash", "req.headers.authorization"], remove: true },
});
```

```bash
npm install zod pino
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Document env vars**

Create `.env.example`:

```bash
# PostgreSQL connection (docker compose default below)
DATABASE_URL=postgres://jobscanner:jobscanner@localhost:5432/jobscanner
# Generate with: npx auth secret  (any random 32+ chars)
AUTH_SECRET=replace-with-32-plus-random-characters
# Optional: Google OAuth (leave unset to disable the Google button)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
LOG_LEVEL=info
```

Confirm `.gitignore` covers `.env*` files except the example (the create-next-app default ignores `.env*`; add an exception line `!.env.example`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add zod-validated env access and pino logger"
```

---

### Task 3: Postgres via Docker Compose + Drizzle schema and migrations

**Files:**
- Create: `docker-compose.yml`, `scripts/init-test-db.sql`
- Create: `drizzle.config.ts`, `drizzle-test.config.ts`
- Create: `src/db/schema.ts`, `src/db/index.ts`
- Create: `.env.local`, `.env.test` (developer machine only — gitignored)

**Interfaces:**
- Produces: `db` (Drizzle instance with schema), `pool` (pg Pool), tables `users`, `accounts`, `sessions`, `verification_tokens`. `users` includes `passwordHash: text | null`.
- Produces scripts: `npm run db:generate`, `db:migrate`, `db:push:test`.

- [ ] **Step 1: Docker Compose for Postgres with a test database**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: jobscanner
      POSTGRES_PASSWORD: jobscanner
      POSTGRES_DB: jobscanner
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jobscanner"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

Create `scripts/init-test-db.sql`:

```sql
CREATE DATABASE jobscanner_test;
```

Run: `docker compose up -d` then `docker compose ps`
Expected: `db` service healthy.

- [ ] **Step 2: Local env files**

Create `.env.local`:

```bash
DATABASE_URL=postgres://jobscanner:jobscanner@localhost:5432/jobscanner
AUTH_SECRET=dev-secret-dev-secret-dev-secret-123456
LOG_LEVEL=debug
```

Create `.env.test`:

```bash
DATABASE_URL=postgres://jobscanner:jobscanner@localhost:5432/jobscanner_test
AUTH_SECRET=test-secret-test-secret-test-secret-12
```

- [ ] **Step 3: Install Drizzle and define the auth schema**

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

Create `src/db/schema.ts` (Auth.js-adapter-compatible tables plus `passwordHash`):

```ts
import { boolean, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);
```

(`next-auth` is installed in Task 6; installing it now for the type import is fine: `npm install next-auth@beta`.)

Create `src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ?? new Pool({ connectionString: getEnv().DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
```

- [ ] **Step 4: Drizzle configs and scripts**

Create `drizzle.config.ts`:

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Create `drizzle-test.config.ts` (same but loads `.env.test`):

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.test" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add to `package.json` `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push:test": "drizzle-kit push --config drizzle-test.config.ts --force"
```

- [ ] **Step 5: Generate and run the migration**

Run: `npm run db:generate` — expected: SQL file appears under `drizzle/`.
Run: `npm run db:migrate` — expected: applies cleanly.
Run: `npm run db:push:test` — expected: test DB schema synced.
Verify: `docker compose exec db psql -U jobscanner -d jobscanner -c "\dt"` lists `users`, `accounts`, `sessions`, `verification_tokens`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — expected: clean.

```bash
git add -A
git commit -m "feat: add Postgres via docker compose and Drizzle auth schema with migrations"
```

---

### Task 4: Health check endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"status":"ok","db":"up"}` or `503 {"status":"degraded","db":"down"}`. CI and deploys probe this.

- [ ] **Step 1: Implement the route**

Create `src/app/api/health/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "up" });
  } catch (error) {
    logger.error({ error }, "health check failed");
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify against the running stack**

Run: `npm run dev` (background), then `curl -s http://localhost:3000/api/health`
Expected: `{"status":"ok","db":"up"}`.
Then `docker compose stop db`, curl again — expected 503 with `"db":"down"`. Restart with `docker compose start db`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add /api/health endpoint with database probe"
```

---

### Task 5: User service — password hashing and account creation

**Files:**
- Create: `src/lib/services/users.ts`
- Test: `tests/services/users.test.ts`

**Interfaces:**
- Consumes: `db`, `users` table (Task 3).
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `createUser(input: { email: string; password: string; name: string }): Promise<{ id: string; email: string; name: string | null }>` — lowercases email, throws `DuplicateEmailError` on existing email, never returns the hash.
  - `class DuplicateEmailError extends Error`

- [ ] **Step 1: Write failing tests (integration — uses `jobscanner_test` DB)**

Create `tests/services/users.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  createUser,
  DuplicateEmailError,
  hashPassword,
  verifyPassword,
} from "@/lib/services/users";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(hash).not.toContain("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("createUser", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table users cascade`);
  });

  it("creates a user with lowercased email and no hash in the result", async () => {
    const user = await createUser({
      email: "Jane@Example.COM",
      password: "s3cret-password",
      name: "Jane",
    });
    expect(user.email).toBe("jane@example.com");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate email regardless of case", async () => {
    await createUser({ email: "jane@example.com", password: "s3cret-password", name: "Jane" });
    await expect(
      createUser({ email: "JANE@example.com", password: "other-password", name: "Jane 2" })
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run db:push:test && npm test`
Expected: FAIL — cannot resolve `@/lib/services/users`.

- [ ] **Step 3: Implement the service**

```bash
npm install bcryptjs
```

Create `src/lib/services/users.ts`:

```ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const BCRYPT_COST = 12;

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "DuplicateEmailError";
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ id: string; email: string; name: string | null }> {
  const email = input.email.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) throw new DuplicateEmailError();

  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({ email, name: input.name, passwordHash })
    .returning({ id: users.id, email: users.email, name: users.name });
  return row;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add user service with bcrypt hashing and duplicate-email guard"
```

---

### Task 6: Auth.js wiring — credentials + optional Google, JWT sessions, middleware

**Files:**
- Create: `src/auth.config.ts` (edge-safe), `src/auth.ts` (full, Node-only)
- Create: `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- Create: `src/types/next-auth.d.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 5), `db`, `users` (Task 3).
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` from `@/auth`; `session.user.id: string` is populated; middleware redirects unauthenticated users of matched routes to `/signin`.

- [ ] **Step 1: Install and create the split config**

```bash
npm install next-auth@beta @auth/drizzle-adapter
```

Create `src/auth.config.ts` (no db imports — safe for edge middleware):

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  providers: [], // full providers attached in src/auth.ts (Node runtime only)
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
```

Create `src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/services/users";

const providers = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!user?.passwordHash) return null;

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers,
});
```

Create `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

- [ ] **Step 2: Route handler and middleware**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

Create `src/middleware.ts` (uses the edge-safe config only):

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean. (Behavioral verification happens in Tasks 7–8 once pages exist.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire Auth.js v5 with credentials and optional Google provider"
```

---

### Task 7: Sign-up API route and auth pages

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signin/page.tsx`
- Test: `tests/api/signup.test.ts`

**Interfaces:**
- Consumes: `createUser`, `DuplicateEmailError` (Task 5).
- Produces: `POST /api/auth/signup` — body `{ name, email, password }`; `201 { user }`, `400` invalid input, `409` duplicate email. Pages at `/signup` and `/signin`.

- [ ] **Step 1: Write failing route tests**

Create `tests/api/signup.test.ts` (tests the route handler directly as a function):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { POST } from "@/app/api/auth/signup/route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table users cascade`);
  });

  it("creates a user and returns 201 without the password hash", async () => {
    const res = await POST(request({ name: "Jane", email: "jane@example.com", password: "s3cret-password" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe("jane@example.com");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("returns 400 for a short password", async () => {
    const res = await POST(request({ name: "Jane", email: "jane@example.com", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    await POST(request({ name: "Jane", email: "jane@example.com", password: "s3cret-password" }));
    const res = await POST(request({ name: "Jane", email: "jane@example.com", password: "s3cret-password" }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/auth/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createUser, DuplicateEmailError } from "@/lib/services/users";

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const user = await createUser(parsed.data);
    logger.info({ userId: user.id }, "user signed up");
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    logger.error({ error }, "signup failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Build the pages**

Create `src/app/(auth)/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Sign-up failed");
      setSubmitting(false);
      return;
    }
    await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirectTo: "/dashboard",
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="name" placeholder="Name" required className="rounded border p-2" />
        <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
        <input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          required
          minLength={8}
          className="rounded border p-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm">
        Already have an account? <Link className="underline" href="/signin">Sign in</Link>
      </p>
    </main>
  );
}
```

Create `src/app/(auth)/signin/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      setSubmitting(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
        <input name="password" type="password" placeholder="Password" required className="rounded border p-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm">
        New here? <Link className="underline" href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Visit `/signup`, create an account, confirm redirect to `/dashboard` (404 for now — the redirect itself is what's being verified). Sign out isn't built yet; use a private window to test `/signin` with the same credentials and with a wrong password (expect the inline error).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add signup endpoint and signin/signup pages"
```

---

### Task 8: Protected dashboard shell with sign-out

**Files:**
- Create: `src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`
- Modify: `src/app/page.tsx` (landing → links to signin/signup)

**Interfaces:**
- Consumes: `auth`, `signOut` from `@/auth` (Task 6).
- Produces: authenticated shell (`/dashboard`) with nav placeholders for later phases: Resumes, Jobs, Applications, Settings.

- [ ] **Step 1: Dashboard layout with session guard and sign-out**

Create `src/app/dashboard/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">Job Scanner</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Resumes</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Jobs</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Applications</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Settings</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <span className="mr-3 text-sm text-gray-600">{session.user.email}</span>
          <button type="submit" className="rounded border px-3 py-1 text-sm">Sign out</button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome</h1>
      <p className="mt-2 text-gray-600">
        Phase 2 adds resume upload here. Use the nav above as the app grows.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Replace the landing page**

Replace `src/app/page.tsx` content:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">Job Scanner</h1>
      <p className="text-gray-600">
        Upload your resume, scan the market for matching jobs, and tailor your
        resume to each application — honestly.
      </p>
      <div className="flex gap-3">
        <Link href="/signup" className="rounded bg-black px-4 py-2 text-white">Get started</Link>
        <Link href="/signin" className="rounded border px-4 py-2">Sign in</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

With `npm run dev`:
1. Signed out (private window): `/dashboard` redirects to `/signin`.
2. Sign in → `/dashboard` renders with your email in the header.
3. Sign out → redirected to `/signin`; `/dashboard` redirects again.

- [ ] **Step 4: Build, typecheck, test**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add protected dashboard shell and landing page"
```

---

### Task 9: CI pipeline (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI running lint, typecheck, tests (against a Postgres service), and build on every push/PR to `main`.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: jobscanner
          POSTGRES_PASSWORD: jobscanner
          POSTGRES_DB: jobscanner_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U jobscanner"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DATABASE_URL: postgres://jobscanner:jobscanner@localhost:5432/jobscanner_test
      AUTH_SECRET: ci-secret-ci-secret-ci-secret-123456
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npx drizzle-kit push --dialect postgresql --schema ./src/db/schema.ts --url "$DATABASE_URL" --force
      - run: npm test
      - run: npm run build
```

Note: tests load `.env.test` first, which doesn't exist in CI, so `process.env` values from the workflow win — no extra wiring needed.

- [ ] **Step 2: Verify locally what you can**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green (CI mirrors these).

- [ ] **Step 3: Commit and confirm CI**

```bash
git add -A
git commit -m "ci: add GitHub Actions pipeline with Postgres service"
git push
```

If the repo has a GitHub remote, check `gh run watch` for a green run. If there is no remote yet, note that in the task report and move on.

---

### Task 10: Developer onboarding docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: a "Getting started" section a new developer can follow cold.

- [ ] **Step 1: Extend README**

Append to `README.md`:

```markdown
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
```

- [ ] **Step 2: Follow your own instructions**

From a clean state (`docker compose down`, keep volumes), walk the steps and confirm nothing is missing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add developer onboarding to README"
```

---

## Phase 1 Acceptance

- `npm run lint && npm run typecheck && npm test && npm run build` all pass.
- Fresh browser: sign up → land on dashboard → sign out → sign in → dashboard; `/dashboard` unauthenticated redirects to `/signin`.
- `/api/health` returns 200 with Postgres up, 503 with it stopped.
- CI green (if remote exists).

## What later phases consume from Phase 1

- `getEnv()` for all configuration; extend `envSchema` when adding providers (JSearch/Adzuna/Anthropic keys in Phase 2–3).
- `auth()` for session + `session.user.id` for user scoping of every query.
- `db` + `src/db/schema.ts` — phases add tables (`resumes`, `jobs`, `scans`, …) here and generate migrations.
- `src/lib/services/` — the home for all new business logic.
- `/api/health`, CI workflow, docker-compose — extend, don't replace.
