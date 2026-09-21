import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});
export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (
          !user?.enabled ||
          (user.lockedUntil && user.lockedUntil > new Date())
        )
          return null;
        if (!(await compare(parsed.data.password, user.passwordHash))) {
          const failed = await db.user.update({
            where: { id: user.id },
            data: { failedAttempts: { increment: 1 } },
          });
          if (failed.failedAttempts >= 5)
            await db.user.update({
              where: { id: user.id },
              data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
            });
          return null;
        }
        await db.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockedUntil: null },
        });
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
