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
