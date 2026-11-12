import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-7 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M8 12a4 4 0 1 1 4 4" strokeLinecap="round" />
        <path d="M16 12a4 4 0 1 1-4-4" strokeLinecap="round" />
      </svg>
      LendLoop
    </Link>
  );
}
