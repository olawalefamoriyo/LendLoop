import { v, type Infer } from "convex/values";
import type { Category, Condition, LoanEvent, LoanStatus } from "./lib/domain";

export const vCategory = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("sports"),
  v.literal("other"),
);
export const vCondition = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export const vLoanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export const vLoanEvent = v.union(
  v.literal("request_created"),
  v.literal("request_approved"),
  v.literal("request_declined"),
  v.literal("request_cancelled"),
  v.literal("loan_returned"),
  v.literal("listing_removed"),
);
export const vRole = v.union(v.literal("admin"), v.literal("user"));

export const vAutomationKind = v.union(
  v.literal("notification"), // Convex -> n8n webhook for loan status changes
  v.literal("reminder"), // n8n daily overdue reminder, written back to Convex
  v.literal("workflow_error"), // reported by the n8n error workflow
);

export const vAutomationStatus = v.union(
  v.literal("pending"), // queued (notification) or leased to an n8n run (reminder)
  v.literal("delivered"), // n8n accepted the webhook; awaiting its write-back
  v.literal("sent"), // n8n confirmed the message went out
  v.literal("failed"), // exhausted retries or n8n reported failure
  v.literal("skipped"), // integration not configured / recipient has no email
);

// Compile-time guards: validators and shared domain types must stay in sync.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sync: [
  Same<Infer<typeof vCategory>, Category>,
  Same<Infer<typeof vCondition>, Condition>,
  Same<Infer<typeof vLoanStatus>, LoanStatus>,
  Same<Infer<typeof vLoanEvent>, LoanEvent>,
] = [true, true, true, true];
void _sync;
