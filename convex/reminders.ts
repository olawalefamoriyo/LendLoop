/**
 * Overdue reminders: n8n (scheduled daily) -> Convex HTTP -> these functions.
 *
 * Idempotency: one reminder per loan per UTC day, keyed `reminder:<loanId>:<day>`.
 * `claimOverdue` *leases* each reminder to the calling n8n run, so an
 * overlapping or repeated run the same day won't email the borrower twice. If
 * a run dies before writing back, the lease expires and the next run retries.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { daysBetween, firstName, todayUtc } from "./lib/domain";

export const LEASE_MS = 15 * 60 * 1000;
export const MAX_REMINDER_ATTEMPTS_PER_DAY = 3;
const BATCH_LIMIT = 100;

export function reminderKey(loanId: string, day: string) {
  return `reminder:${loanId}:${day}`;
}

export const claimOverdueArgs = { runId: v.string() };
export const recordStatusArgs = {
  reminderKey: v.string(),
  status: v.union(v.literal("sent"), v.literal("failed")),
  error: v.optional(v.string()),
  executionId: v.optional(v.string()),
};

export const claimOverdue = internalMutation({
  args: claimOverdueArgs,
  handler: async (ctx, { runId }) => {
    const now = Date.now();
    const today = todayUtc(now);
    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(BATCH_LIMIT);

    const reminders = [];
    for (const loan of overdue) {
      const key = reminderKey(loan._id, today);
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      if (existing) {
        const done = existing.status === "sent" || existing.status === "skipped";
        const leased = existing.status === "pending" && (existing.leaseUntil ?? 0) > now;
        const exhausted = existing.attempts >= MAX_REMINDER_ATTEMPTS_PER_DAY;
        if (done || leased || exhausted) continue;
      }

      const [borrower, owner, tool] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.ownerId),
        ctx.db.get(loan.toolId),
      ]);

      if (!borrower?.email) {
        const skipped = {
          status: "skipped" as const,
          lastError: "Borrower has no email on file.",
          updatedAt: now,
        };
        if (existing) await ctx.db.patch(existing._id, skipped);
        else await ctx.db.insert("automationEvents", { key, kind: "reminder", loanId: loan._id, recipient: "borrower", attempts: 0, ...skipped });
        continue;
      }

      const lease = {
        status: "pending" as const,
        leaseUntil: now + LEASE_MS,
        n8nExecutionId: runId,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...lease, attempts: existing.attempts + 1 });
      } else {
        await ctx.db.insert("automationEvents", {
          key,
          kind: "reminder",
          loanId: loan._id,
          recipient: "borrower",
          attempts: 1,
          ...lease,
        });
      }

      // Minimal payload: only what the reminder email needs.
      reminders.push({
        reminderKey: key,
        recipient: { email: borrower.email, firstName: firstName(borrower.name) },
        lenderFirstName: firstName(owner?.name),
        toolName: tool?.name ?? "the tool",
        dueDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
    }

    return { asOf: today, count: reminders.length, reminders };
  },
});

/** n8n write-back after attempting to send. Idempotent; never regresses "sent". */
export const recordStatus = internalMutation({
  args: recordStatusArgs,
  handler: async (ctx, { reminderKey: key, status, error, executionId }) => {
    const ev = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!ev || ev.kind !== "reminder") return { found: false } as const;
    if (ev.status === "sent") return { found: true, changed: false } as const;
    await ctx.db.patch(ev._id, {
      status,
      leaseUntil: undefined,
      lastError: status === "failed" ? (error ?? "n8n reported a failure").slice(0, 500) : undefined,
      n8nExecutionId: executionId ?? ev.n8nExecutionId,
      updatedAt: Date.now(),
    });
    return { found: true, changed: true } as const;
  },
});
