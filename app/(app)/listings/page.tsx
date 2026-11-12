"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CategoryIcon } from "@/components/icons";
import { AvailabilityBadge } from "@/components/ToolBits";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormActions,
  FormError,
  inputClass,
  Loading,
  Modal,
  PageHeader,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel } from "@/lib/format";
import { useAsyncAction } from "@/lib/useAsyncAction";

type MyTool = FunctionReturnType<typeof api.tools.mine>[number];
type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolInput = { name: "", category: "power_tools", condition: "good", description: "" };

function ToolForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ToolInput;
  onSubmit: (input: ToolInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const { pending, error, run } = useAsyncAction();
  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => onSubmit(form));
      }}
    >
      <Field label="Name">
        <input
          className={inputClass}
          required
          minLength={2}
          maxLength={LIMITS.toolName}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Cordless drill"
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select
            className={inputClass}
            value={form.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {conditionLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Short description" hint={`${form.description.length}/${LIMITS.toolDescription}`}>
        <textarea
          className={inputClass}
          rows={3}
          maxLength={LIMITS.toolDescription}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What's included, any quirks, pickup tips…"
        />
      </Field>
      <FormError message={error} />
      <FormActions pending={pending} submitLabel="Save listing" pendingLabel="Saving…" onCancel={onCancel} />
    </form>
  );
}

function ListingCard({ tool, onEdit }: { tool: MyTool; onEdit: () => void }) {
  const remove = useMutation(api.tools.remove);
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <CategoryIcon category={tool.category} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-stone-900">{tool.name}</h3>
          <AvailabilityBadge availability={tool.availability} />
          {tool.pendingRequests > 0 && (
            <Link href="/incoming" className="hover:opacity-80">
              <Badge tone="red" dot>
                {tool.pendingRequests} pending request{tool.pendingRequests > 1 ? "s" : ""}
              </Badge>
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-sm text-stone-500">
          {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
        </p>
        {tool.description && <p className="mt-1.5 line-clamp-2 text-sm text-stone-600">{tool.description}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon="pencil" onClick={onEdit}>
          Edit
        </Button>
        <ActionButton
          variant="danger"
          size="sm"
          icon="trash"
          confirm={`Delete "${tool.name}"? Pending requests will be cancelled and borrowers notified.`}
          action={() => remove({ toolId: tool._id })}
        >
          Delete
        </ActionButton>
      </div>
    </Card>
  );
}

function ListingsInner() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<MyTool | null>(null);
  const creating = params.get("new") === "1";
  const openCreate = () => router.replace("/listings?new=1");
  const closeCreate = () => router.replace("/listings");

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Tools you're offering to neighbors."
        action={
          <Button icon="plus" onClick={openCreate}>
            List a tool
          </Button>
        }
      />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven't listed anything yet" icon="box">
          <p>Got a ladder, a pressure washer or a tent gathering dust?</p>
          <Button className="mt-4" icon="plus" onClick={openCreate}>
            List your first tool
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <ListingCard key={tool._id} tool={tool} onEdit={() => setEditing(tool)} />
          ))}
        </div>
      )}

      <Modal open={creating} onClose={closeCreate} title="List a tool">
        <ToolForm
          initial={EMPTY}
          onCancel={closeCreate}
          onSubmit={async (input) => {
            await create(input);
            closeCreate();
          }}
        />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit listing">
        {editing && (
          <ToolForm
            initial={{
              name: editing.name,
              category: editing.category,
              condition: editing.condition,
              description: editing.description,
            }}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await update({ toolId: editing._id, ...input });
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ListingsInner />
    </Suspense>
  );
}
