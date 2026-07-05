import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/services/users";
import { getEnv } from "@/lib/env";

const env = getEnv();

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
  ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET ? [Google] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers,
});
