"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanCard } from "@/components/LoanBits";
import { ActionButton, EmptyState, Loading, PageHeader, Section } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);

  const pending = loans?.filter((l) => l.status === "pending") ?? [];
  const active = loans?.filter((l) => l.status === "approved") ?? [];
  const past = loans?.filter((l) => !["pending", "approved"].includes(l.status)) ?? [];

  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Neighbors who want to borrow your tools." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet" icon="inbox">
          When someone asks to borrow one of your tools, it shows up here.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <Section title="Waiting for you" count={pending.length} tone="amber">
            {pending.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                viewerRole="owner"
                actions={
                  <>
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      action={() => decide({ loanId: loan._id, decision: "decline" })}
                    >
                      Decline
                    </ActionButton>
                    <ActionButton size="sm" icon="check" action={() => decide({ loanId: loan._id, decision: "approve" })}>
                      Approve
                    </ActionButton>
                  </>
                }
              />
            ))}
          </Section>
          <Section title="Lent out & upcoming" count={active.length} tone="green">
            {active.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                viewerRole="owner"
                actions={
                  <ActionButton
                    size="sm"
                    icon="check"
                    confirm={`Confirm ${loan.counterpart.firstName} has returned the ${loan.tool.name}?`}
                    action={() => markReturned({ loanId: loan._id })}
                  >
                    Mark returned
                  </ActionButton>
                }
              />
            ))}
          </Section>
          <Section title="History" count={past.length}>
            {past.map((loan) => (
              <LoanCard key={loan._id} loan={loan} viewerRole="owner" />
            ))}
          </Section>
        </div>
      )}
    </>
  );
}
