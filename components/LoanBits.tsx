"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import type { Category, LoanStatus } from "@/convex/lib/domain";
import { activityLabel, formatRange, timeAgo } from "@/lib/format";
import { CategoryIcon, Icon } from "./icons";
import { Avatar, Badge, Card, TrustedBadge, type Tone } from "./ui";

type Activity = FunctionReturnType<typeof api.loans.myRequests>[number]["activity"];
type ViewerRole = "owner" | "borrower";

const STATUS: Record<LoanStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "blue" },
};

export function LoanStatusBadge({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue)
    return (
      <Badge tone="red" dot>
        Overdue
      </Badge>
    );
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** "Reminder sent 2 days ago" — recent n8n activity for a loan. */
export function ActivityList({ activity, viewerRole }: { activity: Activity; viewerRole: ViewerRole }) {
  if (activity.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1.5 border-t border-stone-100 pt-3 text-xs text-stone-500">
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

/** The fields both "My requests" and "Incoming" return for a loan. */
type LoanView = {
  _creationTime: number;
  status: LoanStatus;
  startDate: string;
  endDate: string;
  note?: string;
  overdue: boolean;
  tool: { name: string; category?: Category; removed: boolean };
  counterpart: { firstName: string; email?: string; trustedLender?: boolean };
  activity: Activity;
};

/**
 * One loan, seen from either side. `viewerRole` decides the wording:
 * the owner sees the borrower, the borrower sees the lender.
 */
export function LoanCard({
  loan,
  viewerRole,
  actions,
}: {
  loan: LoanView;
  viewerRole: ViewerRole;
  actions?: ReactNode;
}) {
  const who = loan.counterpart;
  return (
    <Card className={loan.overdue ? "ring-red-200" : ""}>
      <div className="flex flex-wrap items-start gap-4">
        <CategoryIcon category={loan.tool.category} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-stone-900">{loan.tool.name}</h3>
            <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
            {loan.tool.removed && <Badge>Listing removed</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={who.firstName} size="sm" />
              {viewerRole === "owner" ? who.firstName : `from ${who.firstName}`}
              {who.trustedLender && <TrustedBadge />}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" className="size-4 text-stone-400" />
              {formatRange(loan.startDate, loan.endDate)}
            </span>
          </div>
          {loan.note && (
            <blockquote className="mt-3 rounded-xl bg-stone-50 px-3.5 py-2.5 text-sm text-stone-600">
              “{loan.note}”
            </blockquote>
          )}
          {who.email && (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
              href={`mailto:${who.email}`}
            >
              <Icon name="mail" />
              {viewerRole === "owner" ? "Contact" : "Arrange pickup with"} {who.firstName}
            </a>
          )}
          {loan.overdue && viewerRole === "borrower" && (
            <p className="mt-2 text-sm font-medium text-red-700">Please return this to {who.firstName} soon.</p>
          )}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-stone-400">
            <Icon name="clock" className="size-3.5" />
            Requested {timeAgo(loan._creationTime)}
          </p>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <ActivityList activity={loan.activity} viewerRole={viewerRole} />
    </Card>
  );
}
