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
