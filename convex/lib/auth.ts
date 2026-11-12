/**
 * Role-based access control, enforced server-side.
 *
 * Every public Convex function that needs a signed-in user is built with
 * `userQuery` / `userMutation` (or the admin variants). The wrapper resolves the
 * caller from the verified Clerk JWT — never from client-supplied ids — and
 * injects `ctx.viewer`. Resource-level checks (e.g. "is this your tool?") live
 * next to the data access in each function, using the `assert*` helpers below.
 */
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";

export type Viewer = Doc<"users">;
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

/** Structured, user-safe error. The client shows `message`; internals never leak. */
export function appError(code: ErrorCode, message: string) {
  return new ConvexError({ code, message });
}

export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw appError("UNAUTHENTICATED", "Please sign in to continue.");
  return viewer;
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer.role === "admin";
}

/** Throw FORBIDDEN unless `ok`. Use for ownership / participation checks. */
export function assertAllowed(ok: boolean, message = "You don't have permission to do that."): asserts ok {
  if (!ok) throw appError("FORBIDDEN", message);
}

export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ viewer: await requireViewer(ctx) })),
);

export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ viewer: await requireViewer(ctx) })),
);

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const viewer = await requireViewer(ctx);
    assertAllowed(isAdmin(viewer), "Admins only.");
    return { viewer };
  }),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const viewer = await requireViewer(ctx);
    assertAllowed(isAdmin(viewer), "Admins only.");
    return { viewer };
  }),
);
