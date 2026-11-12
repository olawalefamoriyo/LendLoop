import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vAutomationKind,
  vAutomationStatus,
  vCategory,
  vCondition,
  vLoanEvent,
  vLoanStatus,
  vRole,
} from "./validators";

export default defineSchema({
  users: defineTable({
    /** Stable identity from the Clerk JWT (issuer + subject). Never trust a client-sent id. */
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.string(),
    role: vRole,
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    /** Soft delete keeps loan history intact. */
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_removed_category", ["removedAt", "category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    /** Denormalized from the tool so ownership checks and "incoming" need no join. */
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD (UTC)
    endDate: v.string(), // YYYY-MM-DD (UTC), inclusive
    note: v.optional(v.string()),
    status: vLoanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_status_endDate", ["status", "endDate"]),

  /**
   * Outbox + audit log for everything n8n does. `key` is the idempotency key:
   *  - notification: `notif:<loanId>:<event>`  (each transition happens once)
   *  - reminder:     `reminder:<loanId>:<YYYY-MM-DD>`  (at most one per loan per day)
   *  - workflow_error: `wferr:<workflowId>:<executionId>`
   */
  automationEvents: defineTable({
    key: v.string(),
    kind: vAutomationKind,
    loanId: v.optional(v.id("loans")),
    event: v.optional(vLoanEvent),
    recipient: v.optional(v.union(v.literal("owner"), v.literal("borrower"))),
    status: vAutomationStatus,
    attempts: v.number(),
    leaseUntil: v.optional(v.number()),
    lastError: v.optional(v.string()),
    n8nExecutionId: v.optional(v.string()),
    detail: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"])
    .index("by_kind", ["kind"]),
});
