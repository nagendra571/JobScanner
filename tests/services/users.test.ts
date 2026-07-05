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
