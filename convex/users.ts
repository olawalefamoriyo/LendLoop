import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { appError, getViewer } from "./lib/auth";
import { vRole } from "./validators";

function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Upsert the caller's profile from their verified Clerk identity.
 * Called by the client once after sign-in. Role is never taken from the client:
 * a user becomes admin only if their *verified* email is in ADMIN_EMAILS
 * (bootstrap) or via the internal `setRole` function (CLI / dashboard).
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Please sign in to continue.");

    const email = identity.email?.toLowerCase();
    const name =
      identity.name?.trim() ||
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ||
      email?.split("@")[0] ||
      "Neighbor";
    const bootstrapAdmin =
      !!email && identity.emailVerified === true && adminAllowlist().includes(email);

    const existing = await getViewer(ctx);
    if (existing) {
      const patch: Partial<typeof existing> = {};
      if (existing.name !== name) patch.name = name;
      if (existing.email !== email) patch.email = email;
      // Promote via allowlist, but never auto-demote (demotion is an explicit admin action).
      if (bootstrapAdmin && existing.role !== "admin") patch.role = "admin";
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      name,
      role: bootstrapAdmin ? "admin" : "user",
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile (null until `store` has run). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      _id: viewer._id,
      name: viewer.name,
      role: viewer.role,
      trustedLender: viewer.trustedLender,
    };
  },
});

/** Ops-only: `npx convex run users:setRole '{"email":"a@b.com","role":"admin"}'` */
export const setRole = internalMutation({
  args: { email: v.string(), role: vRole },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!user) throw new Error(`No user with email ${email} has signed in yet.`);
    await ctx.db.patch(user._id, { role });
    return { userId: user._id, role };
  },
});
