import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Clerk Frontend API URL, e.g. https://verb-noun-00.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      // Must match the `aud` claim of the Clerk "convex" JWT template.
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
