/**
 * Loan notifications: Convex -> n8n webhook.
 *
 * Transactional outbox: the mutation that changes a loan inserts an
 * `automationEvents` row and schedules `deliver` in the same transaction, so a
 * notification is never lost and never sent for a change that rolled back.
 * Delivery is at-least-once with exponential backoff; the deterministic event
 * key lets n8n (and its write-back) deduplicate.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { firstName, type LoanEvent } from "./lib/domain";
import { signBody } from "./lib/hmac";

export const MAX_DELIVERY_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

/** Who should hear about each event. Only that person's contact is sent to n8n. */
export const RECIPIENT_FOR: Record<LoanEvent, "owner" | "borrower"> = {
  request_created: "owner",
  request_cancelled: "owner",
  request_approved: "borrower",
  request_declined: "borrower",
  loan_returned: "borrower",
  listing_removed: "borrower",
};

/** 30s, 2m, 8m, 32m (+ up to 20% jitter). */
export function backoffMs(attempt: number): number {
  const base = 30_000 * 4 ** Math.max(0, attempt - 1);
  return Math.round(base * (1 + Math.random() * 0.2));
}

export function notificationKey(loanId: Id<"loans">, event: LoanEvent) {
  return `notif:${loanId}:${event}`;
}

/** Call from inside a mutation, right after the state change it describes. */
export async function enqueueLoanNotification(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent) {
  const key = notificationKey(loanId, event);
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return existing._id; // each transition happens once; never double-enqueue

  const eventId = await ctx.db.insert("automationEvents", {
    key,
    kind: "notification",
    loanId,
    event,
    recipient: RECIPIENT_FOR[event],
    status: "pending",
    attempts: 0,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { eventId });
  return eventId;
}

/**
 * Build the minimal payload for n8n. Deliberately excludes: user ids, the
 * counterpart's email, tool description/condition, request notes, roles.
 */
export const prepare = internalQuery({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const ev = await ctx.db.get(eventId);
    if (!ev || ev.kind !== "notification" || ev.status !== "pending" || !ev.loanId || !ev.event) {
      return null; // already handled (idempotent re-run) or not a notification
    }
    const loan = await ctx.db.get(ev.loanId);
    if (!loan) return { skip: "Loan no longer exists." } as const;
    const [tool, owner, borrower] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(loan.ownerId),
      ctx.db.get(loan.borrowerId),
    ]);
    const recipient = ev.recipient === "owner" ? owner : borrower;
    const counterpart = ev.recipient === "owner" ? borrower : owner;
    if (!recipient?.email) return { skip: "Recipient has no email on file." } as const;

    return {
      payload: {
        eventId: ev.key,
        type: ev.event,
        occurredAt: new Date(ev._creationTime).toISOString(),
        recipient: { email: recipient.email, firstName: firstName(recipient.name) },
        counterpartFirstName: firstName(counterpart?.name),
        loan: {
          id: loan._id,
          toolName: tool?.name ?? "a tool",
          startDate: loan.startDate,
          endDate: loan.endDate,
        },
      },
    } as const;
  },
});

export const deliver = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const prepared = await ctx.runQuery(internal.notifications.prepare, { eventId });
    if (!prepared) return;
    if ("skip" in prepared) {
      await ctx.runMutation(internal.notifications.recordAttempt, {
        eventId,
        outcome: "skipped",
        error: prepared.skip,
      });
      return;
    }

    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordAttempt, {
        eventId,
        outcome: "skipped",
        error: "n8n integration not configured (N8N_LOAN_EVENTS_WEBHOOK_URL / LENDLOOP_TO_N8N_SECRET).",
      });
      return;
    }

    const body = JSON.stringify(prepared.payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-event-id": prepared.payload.eventId,
          ...(await signBody(secret, body, Date.now())),
        },
        body,
        signal: controller.signal,
      });
      if (res.ok) {
        await ctx.runMutation(internal.notifications.recordAttempt, { eventId, outcome: "delivered" });
        return;
      }
      // 4xx (except timeout / rate limit) won't fix itself on retry — e.g. a bad
      // signature means a secret mismatch. Fail fast so it's visible to admins.
      const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
      await ctx.runMutation(internal.notifications.recordAttempt, {
        eventId,
        outcome: retryable ? "retry" : "failed",
        error: `n8n responded HTTP ${res.status}`,
      });
    } catch (err) {
      const message = controller.signal.aborted
        ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
      await ctx.runMutation(internal.notifications.recordAttempt, { eventId, outcome: "retry", error: message });
    } finally {
      clearTimeout(timer);
    }
  },
});

export const recordAttempt = internalMutation({
  args: {
    eventId: v.id("automationEvents"),
    outcome: v.union(v.literal("delivered"), v.literal("retry"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, outcome, error }) => {
    const ev = await ctx.db.get(eventId);
    if (!ev || ev.status !== "pending") return;
    const attempts = ev.attempts + 1;
    const now = Date.now();

    if (outcome === "retry" && attempts < MAX_DELIVERY_ATTEMPTS) {
      await ctx.db.patch(eventId, { attempts, lastError: error?.slice(0, 500), updatedAt: now });
      await ctx.scheduler.runAfter(backoffMs(attempts), internal.notifications.deliver, { eventId });
      return;
    }
    const status = outcome === "retry" ? "failed" : outcome;
    await ctx.db.patch(eventId, {
      status,
      attempts,
      lastError: status === "delivered" ? undefined : error?.slice(0, 500),
      updatedAt: now,
    });
    if (status === "failed") {
      console.error(`Notification ${ev.key} failed after ${attempts} attempt(s): ${error}`);
    }
  },
});

/**
 * n8n write-back: the message was (or could not be) sent.
 * Idempotent — a retried or duplicated report never regresses "sent".
 */
export const deliveryReportArgs = {
  eventId: v.string(),
  status: v.union(v.literal("sent"), v.literal("failed")),
  error: v.optional(v.string()),
  executionId: v.optional(v.string()),
};

export const recordDeliveryReport = internalMutation({
  args: deliveryReportArgs,
  handler: async (ctx, { eventId, status, error, executionId }) => {
    const ev = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("key", eventId))
      .unique();
    if (!ev || ev.kind !== "notification") return { found: false } as const;
    if (ev.status === "sent") return { found: true, changed: false } as const;
    await ctx.db.patch(ev._id, {
      status,
      lastError: status === "failed" ? (error ?? "n8n reported a failure").slice(0, 500) : undefined,
      n8nExecutionId: executionId,
      updatedAt: Date.now(),
    });
    return { found: true, changed: true } as const;
  },
});
