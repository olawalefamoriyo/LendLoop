import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk middleware only attaches the session to requests. There is deliberately
 * no path-based protection here: authorization is enforced where the data is,
 * in Convex functions that verify the Clerk JWT on every call, and the signed-in
 * area (app/(app)/layout.tsx) redirects signed-out visitors to sign in.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
