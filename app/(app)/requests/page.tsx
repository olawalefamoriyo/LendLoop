"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { ActivityList, LoanStatusBadge } from "@/components/LoanBits";
import { ActionButton, Card, EmptyState, Loading, PageHeader, TrustedBadge } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you've asked to borrow." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">
          <Link href="/tools" className="text-brand-700 underline">
            Browse tools
          </Link>{" "}
          to find something to borrow.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <Card key={loan._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{loan.tool.name}</h3>
                    <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                    {formatRange(loan.startDate, loan.endDate)} · from {loan.counterpart.firstName}
                    {loan.counterpart.trustedLender && <TrustedBadge />}
                  </p>
                  {loan.counterpart.email && (
                    <p className="mt-1 text-sm">
                      Arrange pickup:{" "}
                      <a className="text-brand-700 underline" href={`mailto:${loan.counterpart.email}`}>
                        {loan.counterpart.email}
                      </a>
                    </p>
                  )}
                  {loan.overdue && (
                    <p className="mt-1 text-sm text-red-700">Please return this to {loan.counterpart.firstName} soon.</p>
                  )}
                  <p className="mt-1 text-xs text-stone-400">Requested {timeAgo(loan._creationTime)}</p>
                </div>
                {loan.cancellable && (
                  <ActionButton
                    variant="secondary"
                    confirm="Cancel this request?"
                    action={() => cancel({ loanId: loan._id })}
                  >
                    Cancel request
                  </ActionButton>
                )}
              </div>
              <ActivityList activity={loan.activity} viewerRole="borrower" />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
