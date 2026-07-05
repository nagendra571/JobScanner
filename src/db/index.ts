import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ?? new Pool({ connectionString: getEnv().DATABASE_URL });
if (getEnv().NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
