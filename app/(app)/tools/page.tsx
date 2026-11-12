"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  inputClass,
  Loading,
  Modal,
  PageHeader,
  TrustedBadge,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { addDays, CATEGORIES, LIMITS, type Category } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel, errorMessage, formatDate } from "@/lib/format";

type Tool = FunctionReturnType<typeof api.tools.list>[number];

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function RequestForm({ tool, onDone }: { tool: Tool; onDone: (sent: boolean) => void }) {
  const request = useMutation(api.loans.request);
  const today = localToday();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(addDays(today, 2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await request({ toolId: tool._id, startDate, endDate, note: note || undefined });
          onDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm text-stone-600">
        Ask <strong>{tool.owner.firstName}</strong> to borrow <strong>{tool.name}</strong>. They&apos;ll get a
        notification and can approve or decline.
      </p>
      {tool.availability.status === "available" && tool.availability.nextReservedFrom && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Already reserved from {formatDate(tool.availability.nextReservedFrom)} — pick dates that don&apos;t overlap.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input
            type="date"
            required
            className={inputClass}
            min={today}
            max={addDays(today, LIMITS.maxAdvanceDays)}
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value);
              if (endDate < e.target.value) setEnd(e.target.value);
            }}
          />
        </Field>
        <Field label="Until (inclusive)">
          <input
            type="date"
            required
            className={inputClass}
            min={startDate}
            max={addDays(startDate, LIMITS.maxLoanDays - 1)}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note to the lender (optional)" hint="Only the lender sees this.">
        <textarea
          className={inputClass}
          rows={3}
          maxLength={LIMITS.requestNote}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Putting up shelves on Saturday, can pick up Friday evening."
        />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}

function AvailabilityBadge({ tool }: { tool: Tool }) {
  if (tool.availability.status === "on_loan") {
    return <Badge tone="amber">On loan until {formatDate(tool.availability.until)}</Badge>;
  }
  return <Badge tone="green">Available</Badge>;
}

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [requesting, setRequesting] = useState<Tool | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);
  const isAdmin = me?.role === "admin";

  const visible = tools?.filter((t) => !onlyAvailable || t.availability.status === "available");

  return (
    <>
      <PageHeader
        title="Browse tools"
        subtitle="Everything your neighbors are willing to lend."
        action={
          <Link href="/listings?new=1">
            <Button>+ List a tool</Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
        <FilterChip active={!category} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {categoryLabel(c)}
          </FilterChip>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="accent-brand-600"
          />
          Available now
        </label>
      </div>

      {justRequested && (
        <p role="status" className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Request sent for {justRequested}. Track it under <Link href="/requests" className="underline">My requests</Link>.
        </p>
      )}

      {visible === undefined ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here yet">
          {category ? "No tools in this category." : "No tools have been listed."}{" "}
          <Link href="/listings?new=1" className="text-brand-700 underline">
            List one
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((tool) => (
            <Card key={tool._id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{tool.name}</h3>
                  <p className="text-xs text-stone-500">
                    {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
                  </p>
                </div>
                <AvailabilityBadge tool={tool} />
              </div>
              {tool.description && <p className="mt-2 line-clamp-3 text-sm text-stone-600">{tool.description}</p>}
              <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  {tool.isMine ? "Your listing" : `Lent by ${tool.owner.firstName}`}
                  {tool.owner.trustedLender && <TrustedBadge />}
                </div>
                <div className="flex gap-2">
                  {isAdmin && !tool.isMine && (
                    <ActionButton
                      variant="danger"
                      confirm={`Remove "${tool.name}" for everyone? Open requests will be cancelled.`}
                      action={() => remove({ toolId: tool._id })}
                    >
                      Remove
                    </ActionButton>
                  )}
                  {!tool.isMine &&
                    (tool.viewerHasOpenRequest ? (
                      <Badge>Requested</Badge>
                    ) : (
                      <Button variant="secondary" onClick={() => setRequesting(tool)}>
                        Request to borrow
                      </Button>
                    ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!requesting} onClose={() => setRequesting(null)} title="Request to borrow">
        {requesting && (
          <RequestForm
            tool={requesting}
            onDone={(sent) => {
              if (sent) setJustRequested(requesting.name);
              setRequesting(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
        active ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
