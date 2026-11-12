import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { appError, assertAllowed, userMutation, userQuery } from "./lib/auth";
import {
  addDays,
  daysBetween,
  firstName,
  isValidIsoDate,
  LIMITS,
  rangesOverlap,
  todayUtc,
} from "./lib/domain";
import { getActiveTool } from "./model/tools";
import { enqueueLoanNotification } from "./notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateDates(startDate: string, endDate: string, today: string) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    throw appError("INVALID", "Dates must be valid calendar dates.");
  }
  // One day of slack so users in timezones behind UTC can still request "today".
  if (startDate < addDays(today, -1)) throw appError("INVALID", "Start date can't be in the past.");
  if (endDate < startDate) throw appError("INVALID", "End date must be on or after the start date.");
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    throw appError("INVALID", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
  }
  if (startDate > addDays(today, LIMITS.maxAdvanceDays)) {
    throw appError("INVALID", `You can book at most ${LIMITS.maxAdvanceDays} days ahead.`);
  }
}

async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

async function getLoanOrThrow(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "Request not found.");
  return loan;
}

/** Recent automation activity on a loan, safe to show to either participant. */
export async function loanActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(5);
  return events.map((e) => ({
    kind: e.kind,
    event: e.event,
    recipient: e.recipient,
    status: e.status,
    at: e.updatedAt,
  }));
}

function isOverdue(loan: Doc<"loans">, today: string) {
  return loan.status === "approved" && loan.endDate < today;
}

// ---------------------------------------------------------------------------
// Borrower actions
// ---------------------------------------------------------------------------

export const request = userMutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, startDate, endDate, note }) => {
    const tool = await getActiveTool(ctx, toolId);
    if (!tool) throw appError("NOT_FOUND", "This listing is no longer available.");
    if (tool.ownerId === ctx.viewer._id) throw appError("INVALID", "You can't borrow your own tool.");

    validateDates(startDate, endDate, todayUtc());
    const cleanNote = note?.trim();
    if (cleanNote && cleanNote.length > LIMITS.requestNote) {
      throw appError("INVALID", `Note must be at most ${LIMITS.requestNote} characters.`);
    }

    const mine = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.viewer._id))
      .collect();
    if (mine.some((l) => l.toolId === toolId && l.status === "pending")) {
      throw appError("CONFLICT", "You already have a pending request for this tool.");
    }

    const range = { startDate, endDate };
    if ((await approvedLoansFor(ctx, toolId)).some((l) => rangesOverlap(l, range))) {
      throw appError("CONFLICT", "The tool is already booked for some of those dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: ctx.viewer._id,
      startDate,
      endDate,
      note: cleanNote || undefined,
      status: "pending",
    });
    await enqueueLoanNotification(ctx, loanId, "request_created");
    return loanId;
  },
});

/** Borrowers can withdraw a request until the loan has started. */
export const cancel = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoanOrThrow(ctx, loanId);
    assertAllowed(loan.borrowerId === ctx.viewer._id, "You can only cancel your own requests.");
    const cancellable =
      loan.status === "pending" || (loan.status === "approved" && loan.startDate > todayUtc());
    if (!cancellable) throw appError("CONFLICT", "This request can no longer be cancelled.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanNotification(ctx, loanId, "request_cancelled");
  },
});

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

export const decide = userMutation({
  args: { loanId: v.id("loans"), decision: v.union(v.literal("approve"), v.literal("decline")) },
  handler: async (ctx, { loanId, decision }) => {
    const loan = await getLoanOrThrow(ctx, loanId);
    assertAllowed(loan.ownerId === ctx.viewer._id, "Only the tool's owner can respond to this request.");
    if (loan.status !== "pending") throw appError("CONFLICT", "This request has already been handled.");

    const now = Date.now();
    if (decision === "decline") {
      await ctx.db.patch(loanId, { status: "declined", decidedAt: now });
      await enqueueLoanNotification(ctx, loanId, "request_declined");
      return { autoDeclined: 0 };
    }

    const tool = await getActiveTool(ctx, loan.toolId);
    if (!tool) throw appError("CONFLICT", "This listing has been removed.");
    if (loan.endDate < todayUtc()) throw appError("CONFLICT", "This request's dates have already passed.");
    if ((await approvedLoansFor(ctx, loan.toolId)).some((l) => rangesOverlap(l, loan))) {
      throw appError("CONFLICT", "You've already approved another loan for overlapping dates.");
    }

    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueLoanNotification(ctx, loanId, "request_approved");

    // Other pending requests for the same dates can no longer be honored.
    const overlapping = (
      await ctx.db
        .query("loans")
        .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "pending"))
        .collect()
    ).filter((l) => rangesOverlap(l, loan));
    for (const other of overlapping) {
      await ctx.db.patch(other._id, { status: "declined", decidedAt: now });
      await enqueueLoanNotification(ctx, other._id, "request_declined");
    }
    return { autoDeclined: overlapping.length };
  },
});

/** The lender confirms they got the tool back. */
export const markReturned = userMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoanOrThrow(ctx, loanId);
    assertAllowed(loan.ownerId === ctx.viewer._id, "Only the lender can mark a loan as returned.");
    if (loan.status !== "approved") throw appError("CONFLICT", "Only active loans can be marked returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueLoanNotification(ctx, loanId, "loan_returned");
  },
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** Requests the caller made as a borrower. */
export const myRequests = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      loans.map(async (loan) => {
        const [tool, owner] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.ownerId)]);
        return {
          _id: loan._id,
          _creationTime: loan._creationTime,
          status: loan.status,
          startDate: loan.startDate,
          endDate: loan.endDate,
          note: loan.note,
          overdue: isOverdue(loan, today),
          cancellable: loan.status === "pending" || (loan.status === "approved" && loan.startDate > today),
          tool: { name: tool?.name ?? "Removed tool", category: tool?.category, removed: !!tool?.removedAt },
          counterpart: {
            firstName: firstName(owner?.name),
            trustedLender: owner?.trustedLender ?? false,
            // Contact details are revealed only once a loan is agreed.
            email: loan.status === "approved" ? owner?.email : undefined,
          },
          activity: await loanActivity(ctx, loan._id),
        };
      }),
    );
  },
});

/** Requests for the caller's tools, as a lender. */
export const incoming = userQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      loans.map(async (loan) => {
        const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
        return {
          _id: loan._id,
          _creationTime: loan._creationTime,
          status: loan.status,
          startDate: loan.startDate,
          endDate: loan.endDate,
          note: loan.note,
          overdue: isOverdue(loan, today),
          tool: { name: tool?.name ?? "Removed tool", category: tool?.category, removed: !!tool?.removedAt },
          counterpart: {
            firstName: firstName(borrower?.name),
            email: loan.status === "approved" ? borrower?.email : undefined,
          },
          activity: await loanActivity(ctx, loan._id),
        };
      }),
    );
  },
});
