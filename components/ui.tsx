"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { Icon, type IconName } from "./icons";

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50 disabled:shadow-none",
  secondary:
    "bg-white text-stone-800 shadow-card ring-1 ring-stone-200 hover:bg-stone-50 hover:ring-stone-300 disabled:text-stone-400",
  danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:text-red-300",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-all duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: IconName };

export function Button({ variant, size, icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button {...props} className={buttonClass(variant, size, className)}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** A link styled as a button (avoids invalid <a><button> nesting). */
export function LinkButton({
  variant,
  size,
  icon,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

/**
 * Button that runs an async action, disables itself while pending, and
 * surfaces server errors (e.g. RBAC rejections) next to the button.
 */
export function ActionButton({
  action,
  children,
  confirm,
  ...props
}: Omit<ButtonProps, "onClick"> & { action: () => Promise<unknown>; confirm?: string }) {
  const { pending, error, run } = useAsyncAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          void run(action);
        }}
      >
        {pending ? "Working…" : children}
      </Button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------- badges */

const TONES = {
  neutral: "bg-stone-100 text-stone-600 ring-stone-200/70",
  green: "bg-brand-50 text-brand-700 ring-brand-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/70",
  red: "bg-red-50 text-red-700 ring-red-200/70",
  blue: "bg-sky-50 text-sky-800 ring-sky-200/70",
} as const;
export type Tone = keyof typeof TONES;

const DOTS: Record<Tone, string> = {
  neutral: "bg-stone-400",
  green: "bg-brand-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-sky-500",
};

export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}
    >
      {dot && <span aria-hidden className={`size-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

export function TrustedBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70">
      <Icon name="shield" className="size-3.5" /> Trusted Lender
    </span>
  );
}

/* ------------------------------------------------------------------- layout */

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-card ring-1 ring-stone-200/80 ${
        interactive ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-stone-300" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Titled group of cards; renders nothing when empty. */
export function Section({
  title,
  count,
  tone = "neutral",
  children,
}: {
  title: string;
  count: number;
  tone?: Tone;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-700">
        {title} <Badge tone={tone}>{count}</Badge>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  icon = "inbox",
  children,
}: {
  title: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-6 py-14 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name={icon} className="size-6" />
      </span>
      <p className="font-semibold text-stone-800">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200/80">
          <div className="size-11 animate-pulse rounded-xl bg-stone-200/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-stone-200/70" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Circle with the person's initial; color is stable per name. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const palette = [
    "bg-amber-100 text-amber-800",
    "bg-brand-100 text-brand-800",
    "bg-sky-100 text-sky-800",
    "bg-rose-100 text-rose-800",
    "bg-violet-100 text-violet-800",
  ];
  const hash = [...name].reduce((h, c) => h + c.charCodeAt(0), 0);
  const dims = size === "sm" ? "size-6 text-[11px]" : "size-8 text-xs";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${palette[hash % palette.length]}`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/* ----------------------------------------------------------- filters & tabs */

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-stone-900 text-white shadow-sm"
          : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="mb-6 inline-flex gap-1 rounded-xl bg-stone-200/60 p-1 text-sm" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={value === t}
          onClick={() => onChange(t)}
          className={`rounded-lg px-4 py-1.5 font-semibold transition-colors ${
            value === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- forms */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-stone-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-card ring-1 ring-stone-300 transition-shadow placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";

const NOTICE: Record<"info" | "success" | "warning" | "error", { cls: string; icon: IconName }> = {
  info: { cls: "bg-sky-50 text-sky-900 ring-sky-200/70", icon: "bell" },
  success: { cls: "bg-brand-50 text-brand-800 ring-brand-200/70", icon: "check" },
  warning: { cls: "bg-amber-50 text-amber-900 ring-amber-200/70", icon: "alert" },
  error: { cls: "bg-red-50 text-red-800 ring-red-200/70", icon: "alert" },
};

/** Inline banner for status, warnings and errors. */
export function Notice({
  tone = "info",
  onDismiss,
  children,
}: {
  tone?: keyof typeof NOTICE;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const n = NOTICE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset ${n.cls}`}
    >
      <Icon name={n.icon} className="mt-0.5 size-4" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Notice tone="error">{message}</Notice>;
}

/** Cancel + submit row shared by modal forms. */
export function FormActions({
  pending,
  submitLabel,
  pendingLabel,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

/** Accessible modal built on <dialog>. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,32rem)] rounded-2xl p-0 shadow-2xl ring-1 ring-stone-200 backdrop:bg-stone-900/40"
    >
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

/** Small summary tile (used on dashboards). */
export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon: IconName }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-200/80">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon name={icon} className="size-5" />
      </span>
      <div>
        <p className="text-xl font-bold leading-none text-stone-900">{value}</p>
        <p className="mt-1 text-xs font-medium text-stone-500">{label}</p>
      </div>
    </div>
  );
}
