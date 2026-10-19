import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const devLoginEnabled =
  process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

const providers: Provider[] = [];
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        return db.user.upsert({
          where: { email },
          update: {},
          create: { email, name: email.split("@")[0] },
        });
      },
    }),
  );
}

export const authProviders = providers.map((p) => {
  const config = typeof p === "function" ? p() : p;
  return { id: config.id, name: config.name };
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // JWT sessions so the dev Credentials provider works alongside OAuth.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** Use in server components, actions and route handlers that need a signed-in user. */
export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/signin");
  return { id, email: session.user?.email ?? null, name: session.user?.name ?? null };
}

/** Route-handler variant: returns null instead of redirecting. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
