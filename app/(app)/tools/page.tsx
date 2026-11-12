"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { CategoryIcon, Icon } from "@/components/icons";
import { AvailabilityBadge } from "@/components/ToolBits";
import {
  ActionButton,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FilterChip,
  FormActions,
  FormError,
  inputClass,
  LinkButton,
  Loading,
  Modal,
  Notice,
  PageHeader,
  TrustedBadge,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { addDays, CATEGORIES, LIMITS, type Category } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel, formatDate } from "@/lib/format";
import { useAsyncAction } from "@/lib/useAsyncAction";

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
  const { pending, error, run } = useAsyncAction();

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => request({ toolId: tool._id, startDate, endDate, note: note || undefined }));
        if (ok) onDone(true);
      }}
    >
      <div className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
        <CategoryIcon category={tool.category} />
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold text-stone-900">{tool.name}</p>
          <p className="text-stone-500">
            {tool.owner.firstName} will be notified and can approve or decline.
          </p>
        </div>
      </div>
      {tool.availability.status === "available" && tool.availability.nextReservedFrom && (
        <Notice tone="warning">
          Already reserved from {formatDate(tool.availability.nextReservedFrom)}. Pick dates that don&apos;t overlap.
        </Notice>
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
      <FormActions
        pending={pending}
        submitLabel="Send request"
        pendingLabel="Sending…"
        onCancel={() => onDone(false)}
      />
    </form>
  );
}

function ToolCard({ tool, isAdmin, onRequest }: { tool: Tool; isAdmin: boolean; onRequest: () => void }) {
  const remove = useMutation(api.tools.remove);
  return (
    <Card interactive className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <CategoryIcon category={tool.category} />
        <AvailabilityBadge availability={tool.availability} />
      </div>
      <h3 className="mt-4 text-lg font-bold leading-snug tracking-tight text-stone-900">{tool.name}</h3>
      <p className="mt-0.5 text-sm text-stone-500">
        {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
      </p>
      {tool.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-stone-600">{tool.description}</p>}
      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-stone-600">
            {tool.isMine ? (
              <Badge>Your listing</Badge>
            ) : (
              <>
                <Avatar name={tool.owner.firstName} size="sm" />
                <span className="truncate font-medium">{tool.owner.firstName}</span>
                {tool.owner.trustedLender && <TrustedBadge />}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {isAdmin && !tool.isMine && (
              <ActionButton
                variant="danger"
                size="sm"
                confirm={`Remove "${tool.name}" for everyone? Open requests will be cancelled.`}
                action={() => remove({ toolId: tool._id })}
              >
                Remove
              </ActionButton>
            )}
            {!tool.isMine &&
              (tool.viewerHasOpenRequest ? (
                <Badge tone="amber">
                  <Icon name="clock" className="size-3.5" /> Requested
                </Badge>
              ) : (
                <Button size="sm" onClick={onRequest}>
                  Borrow
                </Button>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [requesting, setRequesting] = useState<Tool | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";

  const visible = tools?.filter((t) => !onlyAvailable || t.availability.status === "available");

  return (
    <>
      <PageHeader
        title="Browse tools"
        subtitle="Everything your neighbors are willing to lend."
        action={
          <LinkButton href="/listings?new=1" icon="plus">
            List a tool
          </LinkButton>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
        <FilterChip active={!category} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {categoryLabel(c)}
          </FilterChip>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          Available now
        </label>
      </div>

      {justRequested && (
        <div className="mb-6">
          <Notice tone="success" onDismiss={() => setJustRequested(null)}>
            Request sent for <strong>{justRequested}</strong>. Track it under{" "}
            <Link href="/requests" className="font-semibold underline">
              My requests
            </Link>
            .
          </Notice>
        </div>
      )}

      {visible === undefined ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here yet" icon="search">
          {category ? "No tools in this category." : "No tools have been listed."}{" "}
          <Link href="/listings?new=1" className="font-semibold text-brand-700 underline">
            List one
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((tool) => (
            <ToolCard key={tool._id} tool={tool} isAdmin={isAdmin} onRequest={() => setRequesting(tool)} />
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
