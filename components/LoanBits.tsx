"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { LoanStatus } from "@/convex/lib/domain";
import { activityLabel } from "@/lib/format";
import { Badge } from "./ui";

type Activity = FunctionReturnType<typeof api.loans.myRequests>[number]["activity"];

const STATUS: Record<LoanStatus, { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "blue" },
};

export function LoanStatusBadge({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** "Reminder sent 2 days ago" — recent n8n activity for a loan. */
export function ActivityList({ activity, viewerRole }: { activity: Activity; viewerRole: "owner" | "borrower" }) {
  if (activity.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
      {activity.map((a, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${
              a.status === "failed" ? "bg-red-500" : a.status === "sent" ? "bg-brand-500" : "bg-stone-300"
            }`}
          />
          {activityLabel(a, viewerRole)}
        </li>
      ))}
    </ul>
  );
}
