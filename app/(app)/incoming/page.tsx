"use client";

import { useMutation, useQuery } from "convex/react";
import { ActivityList, LoanStatusBadge } from "@/components/LoanBits";
import { ActionButton, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";

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
        <EmptyState title="No requests yet">When someone asks to borrow one of your tools, it shows up here.</EmptyState>
      ) : (
        <div className="space-y-8">
          <Section title="Waiting for you" count={pending.length}>
            {pending.map((loan) => (
              <LoanCard key={loan._id} loan={loan}>
                <ActionButton variant="secondary" action={() => decide({ loanId: loan._id, decision: "decline" })}>
                  Decline
                </ActionButton>
                <ActionButton action={() => decide({ loanId: loan._id, decision: "approve" })}>Approve</ActionButton>
              </LoanCard>
            ))}
          </Section>
          <Section title="Lent out & upcoming" count={active.length}>
            {active.map((loan) => (
              <LoanCard key={loan._id} loan={loan}>
                <ActionButton
                  confirm={`Confirm ${loan.counterpart.firstName} has returned the ${loan.tool.name}?`}
                  action={() => markReturned({ loanId: loan._id })}
                >
                  Mark returned
                </ActionButton>
              </LoanCard>
            ))}
          </Section>
          <Section title="History" count={past.length}>
            {past.map((loan) => (
              <LoanCard key={loan._id} loan={loan} />
            ))}
          </Section>
        </div>
      )}
    </>
  );
}

type Loan = NonNullable<ReturnType<typeof useQuery<typeof api.loans.incoming>>>[number];

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title} <span className="text-stone-400">({count})</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function LoanCard({ loan, children }: { loan: Loan; children?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{loan.tool.name}</h3>
            <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
          </div>
          <p className="mt-0.5 text-sm text-stone-600">
            {loan.counterpart.firstName} · {formatRange(loan.startDate, loan.endDate)}
          </p>
          {loan.note && (
            <blockquote className="mt-2 border-l-2 border-stone-200 pl-3 text-sm italic text-stone-600">
              {loan.note}
            </blockquote>
          )}
          {loan.counterpart.email && (
            <p className="mt-1 text-sm">
              Contact:{" "}
              <a className="text-brand-700 underline" href={`mailto:${loan.counterpart.email}`}>
                {loan.counterpart.email}
              </a>
            </p>
          )}
          <p className="mt-1 text-xs text-stone-400">Requested {timeAgo(loan._creationTime)}</p>
        </div>
        {children && <div className="flex gap-2">{children}</div>}
      </div>
      <ActivityList activity={loan.activity} viewerRole="owner" />
    </Card>
  );
}
