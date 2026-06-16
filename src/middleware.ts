export { auth as middleware } from "@/auth";

// Protect everything except NextAuth's own routes, the login page, and static
// assets. Unauthenticated requests are redirected to the configured sign-in
// page (/login); this also closes the /api/* data routes.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
