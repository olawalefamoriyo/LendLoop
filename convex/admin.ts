import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { adminMutation, adminQuery, appError } from "./lib/auth";
import { todayUtc } from "./lib/domain";

/** Every loan, newest first (admins can view all loans). */
export const listLoans = adminQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(
      loans.map(async (loan) => {
        const [tool, owner, borrower] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.ownerId),
          ctx.db.get(loan.borrowerId),
        ]);
        return {
          _id: loan._id,
          _creationTime: loan._creationTime,
          status: loan.status,
          startDate: loan.startDate,
          endDate: loan.endDate,
          overdue: loan.status === "approved" && loan.endDate < today,
          toolName: tool?.name ?? "—",
          ownerName: owner?.name ?? "—",
          borrowerName: borrower?.name ?? "—",
        };
      }),
    );
  },
});

export const listUsers = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").order("desc").take(500);
    return await Promise.all(
      users.map(async (u) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id))
          .collect();
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          trustedLender: u.trustedLender,
          activeListings: tools.filter((t) => t.removedAt === undefined).length,
        };
      }),
    );
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

/** Failed / stuck automations and n8n workflow errors, so nothing fails silently. */
export const automationHealth = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [failed, pending, workflowErrors] = await Promise.all([
      ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(25),
      ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "pending")).order("desc").take(25),
      ctx.db.query("automationEvents").withIndex("by_kind", (q) => q.eq("kind", "workflow_error")).order("desc").take(25),
    ]);
    const shape = (e: (typeof failed)[number]) => ({
      _id: e._id,
      kind: e.kind,
      event: e.event,
      key: e.key,
      status: e.status,
      attempts: e.attempts,
      lastError: e.lastError,
      detail: e.detail,
      n8nExecutionId: e.n8nExecutionId,
      updatedAt: e.updatedAt,
    });
    return {
      failed: failed.filter((e) => e.kind !== "workflow_error").map(shape),
      pending: pending.map(shape),
      workflowErrors: workflowErrors.map(shape),
    };
  },
});

/** Manually re-drive a failed notification once the underlying issue is fixed. */
export const retryNotification = adminMutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const ev = await ctx.db.get(eventId);
    if (!ev || ev.kind !== "notification") throw appError("NOT_FOUND", "Notification not found.");
    if (ev.status !== "failed" && ev.status !== "skipped") {
      throw appError("CONFLICT", "Only failed or skipped notifications can be retried.");
    }
    await ctx.db.patch(eventId, { status: "pending", attempts: 0, lastError: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { eventId });
  },
});

/** Called by the n8n error workflow (via HTTP). Idempotent per execution. */
export const workflowErrorArgs = {
  workflowId: v.string(),
  workflowName: v.string(),
  executionId: v.string(),
  lastNodeExecuted: v.optional(v.string()),
  message: v.string(),
  executionUrl: v.optional(v.string()),
};

export const recordWorkflowError = internalMutation({
  args: workflowErrorArgs,
  handler: async (ctx, args) => {
    const key = `wferr:${args.workflowId}:${args.executionId}`;
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) return { recorded: false };
    const detail = [args.workflowName, args.lastNodeExecuted && `at "${args.lastNodeExecuted}"`, args.executionUrl]
      .filter(Boolean)
      .join(" · ");
    await ctx.db.insert("automationEvents", {
      key,
      kind: "workflow_error",
      status: "failed",
      attempts: 1,
      lastError: args.message.slice(0, 500),
      detail: detail.slice(0, 500),
      n8nExecutionId: args.executionId,
      updatedAt: Date.now(),
    });
    return { recorded: true };
  },
});
