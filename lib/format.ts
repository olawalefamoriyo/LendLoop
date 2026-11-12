import { ConvexError } from "convex/values";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  type Category,
  type Condition,
  type LoanEvent,
} from "@/convex/lib/domain";

export const categoryLabel = (c?: Category) => (c ? CATEGORY_LABELS[c] : "—");
export const conditionLabel = (c: Condition) => CONDITION_LABELS[c];

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Turn a ConvexError (thrown by our functions) into a friendly message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string;
    return typeof data === "string" ? data : (data.message ?? "Something went wrong.");
  }
  return "Something went wrong. Please try again.";
}

type Activity = {
  kind: "notification" | "reminder" | "workflow_error";
  event?: LoanEvent;
  recipient?: "owner" | "borrower";
  status: "pending" | "delivered" | "sent" | "failed" | "skipped";
  at: number;
};

const EVENT_LABEL: Record<LoanEvent, string> = {
  request_created: "New-request notice",
  request_approved: "Approval notice",
  request_declined: "Decline notice",
  request_cancelled: "Cancellation notice",
  loan_returned: "Return confirmation",
  listing_removed: "Listing-removed notice",
};

export function activityLabel(a: Activity, viewerRole: "owner" | "borrower"): string {
  const who = a.recipient === viewerRole ? "you" : a.recipient === "owner" ? "the lender" : "the borrower";
  const what = a.kind === "reminder" ? "Overdue reminder" : a.event ? EVENT_LABEL[a.event] : "Notification";
  switch (a.status) {
    case "sent":
      return `${what} sent to ${who} ${timeAgo(a.at)}`;
    case "delivered":
      return `${what} for ${who} handed to automation ${timeAgo(a.at)}`;
    case "pending":
      return `${what} for ${who} queued`;
    case "failed":
      return `${what} to ${who} failed ${timeAgo(a.at)}`;
    case "skipped":
      return `${what} to ${who} skipped`;
  }
}
