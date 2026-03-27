import { env } from "@/env";
import { db } from "@/server/db";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession, type Session } from "next-auth";
import { type Adapter } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { createRemoteJWKSet, jwtVerify } from "jose";

const REGION = env.COGNITO_REGION;
const USER_POOL_ID = env.COGNITO_USER_POOL_ID;
const CLIENT_ID = env.COGNITO_CLIENT_ID;

const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

const JWKS = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      hasAccess: boolean;
      location?: string;
      role: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    hasAccess: boolean;
    role: string;
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,

  // Allow cookies to be sent when embedded in a cross-origin iframe
  cookies: {
    csrfToken: {
      name: "__Host-next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    callbackUrl: {
      name: "__Secure-next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
  },

  session: {
    strategy: "jwt",
  },

  // ================================
  // 🔑 Providers
  // ================================
  providers: [
    // ✅ Existing Google login (unchanged)
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),

    // ✅ NEW: Cognito token login (for iframe SSO)
    CredentialsProvider({
      name: "CognitoToken",
      credentials: {
        token: {},
      },
      async authorize(credentials) {
        try {
          const token = credentials?.token as string | undefined;
          if (!token) return null;

          // 🔐 Verify Cognito JWT
          const { payload } = await jwtVerify(token, JWKS, {
            issuer,
            audience: CLIENT_ID,
          });

          const email = payload.email as string;
          const name = payload.name as string;

          if (!email) return null;

          const user = await db.user.upsert({
            where: { email },
            update: {},
            create: {
              email,
              name,
              role: "USER",
              hasAccess: true,
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            hasAccess: user.hasAccess,
          };
        } catch (err) {
          console.error("Cognito token auth failed:", err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.hasAccess = user.hasAccess;
        token.name = user.name;
        token.image = user.image;
        token.picture = user.image;
        token.location = (user as Session["user"]).location;
        token.role = user.role;
        token.isAdmin = user.role === "ADMIN";
      }

      if (trigger === "update" && (session as Session)?.user) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
        });

        if (session) {
          token.name = (session as Session).user.name;
          token.image = (session as Session).user.image;
          token.picture = (session as Session).user.image;
          token.location = (session as Session).user.location;
          token.role = (session as Session).user.role;
          token.isAdmin = (session as Session).user.role === "ADMIN";
        }

        if (dbUser) {
          token.hasAccess = dbUser.hasAccess ?? false;
          token.role = dbUser.role;
          token.isAdmin = dbUser.role === "ADMIN";
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.hasAccess = token.hasAccess as boolean;
      session.user.location = token.location as string;
      session.user.role = token.role as string;
      session.user.isAdmin = token.role === "ADMIN";
      return session;
    },

    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
          select: { id: true, hasAccess: true, role: true },
        });

        if (dbUser) {
          user.hasAccess = dbUser.hasAccess;
          user.role = dbUser.role;
        } else {
          user.hasAccess = false;
          user.role = "USER";
        }
      }

      return true;
    },
  },

  adapter: PrismaAdapter(db) as Adapter,
});
