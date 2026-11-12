import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { todayUtc } from "../lib/domain";

export type Availability =
  | { status: "available"; nextReservedFrom?: string }
  | { status: "on_loan"; until: string };

/**
 * A tool is "on loan" if an approved loan has started (including overdue loans
 * that have not been marked returned). Future approved loans are reservations:
 * the tool is still shown as available, with the next reserved date.
 */
export async function getAvailability(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today = todayUtc(),
): Promise<Availability> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  const active = approved.find((l) => l.startDate <= today);
  if (active) return { status: "on_loan", until: active.endDate };
  const next = approved.map((l) => l.startDate).sort()[0];
  return next ? { status: "available", nextReservedFrom: next } : { status: "available" };
}

export async function getActiveTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"tools"> | null> {
  const tool = await ctx.db.get(toolId);
  return tool && tool.removedAt === undefined ? tool : null;
}
