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
