"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanStatusBadge } from "@/components/LoanBits";
import { ActionButton, Avatar, Badge, Card, EmptyState, Loading, PageHeader, Section, Stat, Tabs, TrustedBadge, type Tone } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";

const TABS = ["Loans", "Members", "Automation"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("Loans");

  // The UI hides this page from non-admins, but the queries below are
  // independently protected by adminQuery in Convex.
  if (!me) return <Loading />;
  if (me.role !== "admin") {
    return (
      <EmptyState title="Admins only" icon="shield">
        You don&apos;t have access to this page.
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderate listings, review loans and keep an eye on automations." />
      <Overview />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Loans" && <LoansTab />}
      {tab === "Members" && <MembersTab />}
      {tab === "Automation" && <AutomationTab />}
      <p className="mt-6 text-xs text-stone-400">To remove a listing, use the Remove button on Browse.</p>
    </>
  );
}

function Overview() {
  const loans = useQuery(api.admin.listLoans);
  const users = useQuery(api.admin.listUsers);
  const health = useQuery(api.admin.automationHealth);
  const count = (n: number | undefined) => (n === undefined ? "–" : n);
  const issues = health && health.failed.length + health.workflowErrors.length;
  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat icon="handshake" label="Active loans" value={count(loans?.filter((l) => l.status === "approved").length)} />
      <Stat icon="alert" label="Overdue" value={count(loans?.filter((l) => l.overdue).length)} />
      <Stat icon="shield" label="Members" value={count(users?.length)} />
      <Stat icon="bell" label="Automation issues" value={count(issues)} />
    </div>
  );
}

function LoansTab() {
  const loans = useQuery(api.admin.listLoans);
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <EmptyState title="No loans yet" />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-5 py-3 font-medium">Tool</th>
            <th className="px-5 py-3 font-medium">Lender</th>
            <th className="px-5 py-3 font-medium">Borrower</th>
            <th className="px-5 py-3 font-medium">Dates</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {loans.map((l) => (
            <tr key={l._id} className="transition-colors hover:bg-stone-50/70">
              <td className="px-5 py-3 font-medium">{l.toolName}</td>
              <td className="px-5 py-3">{l.ownerName}</td>
              <td className="px-5 py-3">{l.borrowerName}</td>
              <td className="whitespace-nowrap px-5 py-3">{formatRange(l.startDate, l.endDate)}</td>
              <td className="px-5 py-3">
                <LoanStatusBadge status={l.status} overdue={l.overdue} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MembersTab() {
  const users = useQuery(api.admin.listUsers);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  if (users === undefined) return <Loading />;
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <Card key={u._id} className="flex flex-wrap items-center gap-4">
          <Avatar name={u.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-stone-900">{u.name}</span>
              {u.role === "admin" && <Badge tone="amber">Admin</Badge>}
              {u.trustedLender && <TrustedBadge />}
            </div>
            <p className="text-xs text-stone-500">
              {u.email ?? "no email"} · {u.activeListings} active listing{u.activeListings === 1 ? "" : "s"}
            </p>
          </div>
          <ActionButton
            size="sm"
            variant={u.trustedLender ? "secondary" : "primary"}
            action={() => setTrusted({ userId: u._id, trusted: !u.trustedLender })}
          >
            {u.trustedLender ? "Remove Trusted badge" : "Mark Trusted Lender"}
          </ActionButton>
        </Card>
      ))}
    </div>
  );
}

function AutomationTab() {
  const health = useQuery(api.admin.automationHealth);
  const retry = useMutation(api.admin.retryNotification);
  if (health === undefined) return <Loading />;

  const empty = health.failed.length + health.workflowErrors.length + health.pending.length === 0;
  if (empty)
    return (
      <EmptyState title="All automations healthy" icon="check">
        No failed, stuck or erroring runs.
      </EmptyState>
    );

  return (
    <div className="space-y-8">
      <EventSection title="Failed deliveries" tone="red" events={health.failed}>
        {(e) =>
          e.kind === "notification" ? (
            <ActionButton variant="secondary" size="sm" action={() => retry({ eventId: e._id })}>
              Retry
            </ActionButton>
          ) : null
        }
      </EventSection>
      <EventSection title="n8n workflow errors" tone="red" events={health.workflowErrors} />
      <EventSection title="In flight" tone="amber" events={health.pending} />
    </div>
  );
}

type HealthEvent = NonNullable<ReturnType<typeof useQuery<typeof api.admin.automationHealth>>>["failed"][number];

function EventSection({
  title,
  tone,
  events,
  children,
}: {
  title: string;
  tone: Tone;
  events: HealthEvent[];
  children?: (e: HealthEvent) => React.ReactNode;
}) {
  return (
    <Section title={title} count={events.length} tone={tone}>
      {events.map((e) => (
        <Card key={e._id} className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-stone-900">
              {e.kind === "workflow_error" ? e.detail : `${e.kind}${e.event ? ` · ${e.event}` : ""}`}
            </p>
            {e.lastError && <p className="mt-1 break-words text-red-700">{e.lastError}</p>}
            <p className="mt-1 font-mono text-xs text-stone-400">
              {e.key} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"} · {timeAgo(e.updatedAt)}
              {e.n8nExecutionId && ` · n8n exec ${e.n8nExecutionId}`}
            </p>
          </div>
          {children?.(e)}
        </Card>
      ))}
    </Section>
  );
}
