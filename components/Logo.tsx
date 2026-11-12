import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-stone-900">
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/20">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
          <path d="M8 12a4 4 0 1 1 4 4" strokeLinecap="round" />
          <path d="M16 12a4 4 0 1 1-4-4" strokeLinecap="round" />
        </svg>
      </span>
      LendLoop
    </Link>
  );
}
