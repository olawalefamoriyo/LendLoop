"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanCard } from "@/components/LoanBits";
import { ActionButton, EmptyState, LinkButton, Loading, PageHeader } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you've asked to borrow." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet" icon="handshake">
          <p>Find something you need and ask a neighbor to lend it.</p>
          <LinkButton href="/tools" className="mt-4" icon="search">
            Browse tools
          </LinkButton>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              viewerRole="borrower"
              actions={
                loan.cancellable && (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    confirm="Cancel this request?"
                    action={() => cancel({ loanId: loan._id })}
                  >
                    Cancel request
                  </ActionButton>
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
