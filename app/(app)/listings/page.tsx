"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/domain";
import { categoryLabel, conditionLabel, errorMessage, formatDate } from "@/lib/format";

type MyTool = FunctionReturnType<typeof api.tools.mine>[number];
type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolInput = { name: "", category: "power_tools", condition: "good", description: "" };

function ToolForm({ initial, onSubmit, onCancel }: {
  initial: ToolInput;
  onSubmit: (input: ToolInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await onSubmit(form);
        } catch (err) {
          setError(errorMessage(err));
          setPending(false);
        }
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
          <select className={inputClass} value={form.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save listing"}
        </Button>
      </div>
    </form>
  );
}

function ListingsInner() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<MyTool | null>(null);
  const creating = params.get("new") === "1";
  const closeCreate = () => router.replace("/listings");

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Tools you're offering to neighbors."
        action={<Button onClick={() => router.replace("/listings?new=1")}>+ List a tool</Button>}
      />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">
          Got a ladder, a pressure washer or a tent? <button className="text-brand-700 underline" onClick={() => router.replace("/listings?new=1")}>List it</button>.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <Card key={tool._id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{tool.name}</h3>
                  {tool.availability.status === "on_loan" ? (
                    <Badge tone="amber">On loan until {formatDate(tool.availability.until)}</Badge>
                  ) : (
                    <Badge tone="green">Available</Badge>
                  )}
                  {tool.pendingRequests > 0 && (
                    <Link href="/incoming">
                      <Badge tone="red">
                        {tool.pendingRequests} pending request{tool.pendingRequests > 1 ? "s" : ""}
                      </Badge>
                    </Link>
                  )}
                </div>
                <p className="text-xs text-stone-500">
                  {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
                </p>
                {tool.description && <p className="mt-1 text-sm text-stone-600">{tool.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(tool)}>
                  Edit
                </Button>
                <ActionButton
                  variant="danger"
                  confirm={`Delete "${tool.name}"? Pending requests will be cancelled and borrowers notified.`}
                  action={() => remove({ toolId: tool._id })}
                >
                  Delete
                </ActionButton>
              </div>
            </Card>
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
