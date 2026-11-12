/**
 * Domain constants shared by the Convex backend and the Next.js frontend.
 * Keep this file free of server-only imports so the client bundle can use it.
 */

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "sports",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  sports: "Sports & outdoors",
  other: "Other",
};

export const CONDITIONS = ["like_new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well-used",
};

export const LOAN_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Events that trigger a notification webhook to n8n. */
export const LOAN_EVENTS = [
  "request_created",
  "request_approved",
  "request_declined",
  "request_cancelled",
  "loan_returned",
  "listing_removed",
] as const;
export type LoanEvent = (typeof LOAN_EVENTS)[number];

export const LIMITS = {
  toolName: 80,
  toolDescription: 500,
  requestNote: 300,
  maxLoanDays: 30,
  maxAdvanceDays: 90,
} as const;

/** Dates are stored as ISO calendar dates (YYYY-MM-DD), interpreted in UTC. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms =
    new Date(`${toIso}T00:00:00Z`).getTime() -
    new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Inclusive date-range overlap. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function firstName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "A neighbor";
}
