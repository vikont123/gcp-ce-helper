import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Only verified accounts on these Workspace domains may sign in.
// @google.com = production Googlers; the altostrat domain = Michael's Argolis
// demo org used for development.
const ALLOWED_DOMAINS = ["@google.com", "@michaelgadaev.altostrat.com"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    // Gate sign-in: the email must be Google-verified AND on an allowed
    // domain. `email_verified` is what stops someone spoofing the address —
    // an unverified Gmail with a fake name can't claim these domains.
    signIn({ profile }) {
      return (
        profile?.email_verified === true &&
        typeof profile.email === "string" &&
        ALLOWED_DOMAINS.some((d) => profile.email!.endsWith(d))
      );
    },
    // Invoked by the middleware on every matched route: no session → NextAuth
    // redirects to the sign-in page. This is what actually closes the app.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: { signIn: "/login" },
});
