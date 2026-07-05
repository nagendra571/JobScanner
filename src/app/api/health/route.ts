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
