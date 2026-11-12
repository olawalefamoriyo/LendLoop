import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appError, assertAllowed, isAdmin, userMutation, userQuery } from "./lib/auth";
import { firstName, LIMITS, todayUtc } from "./lib/domain";
import { getActiveTool, getAvailability } from "./model/tools";
import { enqueueLoanNotification } from "./notifications";
import { vCategory, vCondition } from "./validators";

const toolFields = {
  name: v.string(),
  category: vCategory,
  condition: vCondition,
  description: v.string(),
};

function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > LIMITS.toolName) {
    throw appError("INVALID", `Name must be 2–${LIMITS.toolName} characters.`);
  }
  if (description.length > LIMITS.toolDescription) {
    throw appError("INVALID", `Description must be at most ${LIMITS.toolDescription} characters.`);
  }
  return { name, description };
}

/**
 * PUBLIC (no auth): tools that can be borrowed right now.
 * Data minimization: returns only id, name and category — no owner, no description.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removed_category", (q) => q.eq("removedAt", undefined))
      .order("desc")
      .take(200);
    const result: { _id: Doc<"tools">["_id"]; name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of tools) {
      const availability = await getAvailability(ctx, tool._id, today);
      if (availability.status === "available") {
        result.push({ _id: tool._id, name: tool.name, category: tool.category });
      }
    }
    return result;
  },
});

/** All active listings with availability, optionally filtered by category. */
export const list = userQuery({
  args: { category: v.optional(vCategory) },
  handler: async (ctx, { category }) => {
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removed_category", (q) =>
        category ? q.eq("removedAt", undefined).eq("category", category) : q.eq("removedAt", undefined),
      )
      .order("desc")
      .take(200);

    const myOpenRequests = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.viewer._id))
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "approved")))
      .collect();
    const requestedToolIds = new Set(myOpenRequests.map((l) => l.toolId));

    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          availability: await getAvailability(ctx, tool._id, today),
          // Only a first name + trust badge; contact details are shared after approval.
          owner: { firstName: firstName(owner?.name), trustedLender: owner?.trustedLender ?? false },
          isMine: tool.ownerId === ctx.viewer._id,
          viewerHasOpenRequest: requestedToolIds.has(tool._id),
        };
      }),
    );
  },
});

/** The caller's own listings. */
export const mine = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.viewer._id))
      .order("desc")
      .collect();
    return await Promise.all(
      tools
        .filter((t) => t.removedAt === undefined)
        .map(async (tool) => {
          const pending = await ctx.db
            .query("loans")
            .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
            .collect();
          return {
            _id: tool._id,
            name: tool.name,
            category: tool.category,
            condition: tool.condition,
            description: tool.description,
            availability: await getAvailability(ctx, tool._id, today),
            pendingRequests: pending.length,
          };
        }),
    );
  },
});

export const create = userMutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const { name, description } = cleanToolInput(args);
    return await ctx.db.insert("tools", {
      ownerId: ctx.viewer._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

/** Owners only — admins moderate by removing, not by editing other people's listings. */
export const update = userMutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const tool = await getActiveTool(ctx, toolId);
    if (!tool) throw appError("NOT_FOUND", "Listing not found.");
    assertAllowed(tool.ownerId === ctx.viewer._id, "You can only edit your own listings.");
    const { name, description } = cleanToolInput(args);
    await ctx.db.patch(toolId, { name, description, category: args.category, condition: args.condition });
  },
});

/**
 * Owners can delete their own listing; admins can remove any listing.
 * Soft delete: open requests and future reservations are cancelled and the
 * borrowers are notified. An owner cannot delete a tool that is currently lent
 * out (mark it returned first); an admin can, and the loan stays open.
 */
export const remove = userMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await getActiveTool(ctx, toolId);
    if (!tool) throw appError("NOT_FOUND", "Listing not found.");
    const isOwner = tool.ownerId === ctx.viewer._id;
    assertAllowed(isOwner || isAdmin(ctx.viewer), "You can only delete your own listings.");

    const today = todayUtc();
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect();
    const lentOut = approved.some((l) => l.startDate <= today);
    if (lentOut && !isAdmin(ctx.viewer)) {
      throw appError("CONFLICT", "This tool is currently lent out. Mark it returned before deleting.");
    }

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    const toCancel = [...pending, ...approved.filter((l) => l.startDate > today)];
    for (const loan of toCancel) {
      await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: Date.now() });
      await enqueueLoanNotification(ctx, loan._id, "listing_removed");
    }

    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: ctx.viewer._id });
    return { cancelledRequests: toCancel.length };
  },
});
