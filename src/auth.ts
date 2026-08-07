import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Behind a tunnel / Nginx reverse proxy the request host isn't localhost;
  // trust the forwarded host so auth works over Cloudflare tunnels and in prod.
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const raw = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!raw || !password) return null;

        // Normalised the SAME way signup stores it. Without this, anyone who typed a
        // capital letter in their address could never log in again: signup writes
        // `trim().toLowerCase()`, so `Kevin@X.com` is stored as `kevin@x.com`, and an
        // exact-match lookup on what they typed finds nothing — reported to the player as
        // "wrong email or password", with no way out.
        const email = raw.trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.displayName };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
