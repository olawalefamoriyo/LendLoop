"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LoanStatusBadge } from "@/components/LoanBits";
import { ActionButton, Badge, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatRange, timeAgo } from "@/lib/format";

const TABS = ["Loans", "Members", "Automation"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("Loans");

  // The UI hides this page from non-admins, but the queries below are
  // independently protected by adminQuery in Convex.
  if (me && me.role !== "admin") {
    return <EmptyState title="Admins only">You don&apos;t have access to this page.</EmptyState>;
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderate listings, review loans and keep an eye on automations." />
      <div className="mb-6 flex gap-1 rounded-lg bg-stone-100 p-1 text-sm" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === t ? "bg-white shadow-sm" : "text-stone-500"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Loans" && <LoansTab />}
      {tab === "Members" && <MembersTab />}
      {tab === "Automation" && <AutomationTab />}
      <p className="mt-6 text-xs text-stone-400">To remove a listing, use the Remove button on Browse.</p>
    </>
  );
}

function LoansTab() {
  const loans = useQuery(api.admin.listLoans);
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <EmptyState title="No loans yet" />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Tool</th>
            <th className="px-4 py-2.5 font-medium">Lender</th>
            <th className="px-4 py-2.5 font-medium">Borrower</th>
            <th className="px-4 py-2.5 font-medium">Dates</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {loans.map((l) => (
            <tr key={l._id}>
              <td className="px-4 py-2.5 font-medium">{l.toolName}</td>
              <td className="px-4 py-2.5">{l.ownerName}</td>
              <td className="px-4 py-2.5">{l.borrowerName}</td>
              <td className="whitespace-nowrap px-4 py-2.5">{formatRange(l.startDate, l.endDate)}</td>
              <td className="px-4 py-2.5">
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
        <Card key={u._id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{u.name}</span>
              {u.role === "admin" && <Badge tone="amber">Admin</Badge>}
              {u.trustedLender && <Badge tone="blue">✓ Trusted Lender</Badge>}
            </div>
            <p className="text-xs text-stone-500">
              {u.email ?? "no email"} · {u.activeListings} active listing{u.activeListings === 1 ? "" : "s"}
            </p>
          </div>
          <ActionButton
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
  if (empty) return <EmptyState title="All automations healthy">No failed, stuck or erroring runs.</EmptyState>;

  return (
    <div className="space-y-8">
      <EventSection title="Failed deliveries" tone="red" events={health.failed}>
        {(e) =>
          e.kind === "notification" ? (
            <ActionButton variant="secondary" action={() => retry({ eventId: e._id })}>
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
  tone: "red" | "amber";
  events: HealthEvent[];
  children?: (e: HealthEvent) => React.ReactNode;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title} <Badge tone={tone}>{events.length}</Badge>
      </h2>
      <div className="space-y-2">
        {events.map((e) => (
          <Card key={e._id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {e.kind === "workflow_error" ? e.detail : `${e.kind}${e.event ? ` · ${e.event}` : ""}`}
              </p>
              {e.lastError && <p className="mt-0.5 break-words text-red-700">{e.lastError}</p>}
              <p className="mt-0.5 font-mono text-xs text-stone-400">
                {e.key} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"} · {timeAgo(e.updatedAt)}
                {e.n8nExecutionId && ` · n8n exec ${e.n8nExecutionId}`}
              </p>
            </div>
            {children?.(e)}
          </Card>
        ))}
      </div>
    </section>
  );
}
