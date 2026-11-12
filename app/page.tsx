"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { Logo } from "@/components/Logo";
import { Badge, Button, EmptyState, Loading } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES } from "@/convex/lib/domain";
import { categoryLabel } from "@/lib/format";

/**
 * Driven by Clerk's own session (not Convex's), so a signed-in user is never
 * offered a sign-in modal — Clerk refuses to open it in single-session mode.
 */
function AuthCta({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const cls = size === "lg" ? "px-5 py-2.5 text-base" : "";
  if (!isLoaded) {
    return (
      <Button variant="secondary" disabled className={cls}>
        Loading…
      </Button>
    );
  }
  if (isSignedIn) {
    return (
      <Link href="/tools">
        <Button className={cls}>Open LendLoop →</Button>
      </Link>
    );
  }
  return (
    <SignInButton mode="modal" forceRedirectUrl="/tools">
      <Button className={cls}>Sign in to lend or borrow</Button>
    </SignInButton>
  );
}

export default function LandingPage() {
  const tools = useQuery(api.tools.listPublic);

  const grouped = useMemo(() => {
    if (!tools) return [];
    return CATEGORIES.map((c) => ({ category: c, items: tools.filter((t) => t.category === c) })).filter(
      (g) => g.items.length > 0,
    );
  }, [tools]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <AuthCta />
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="py-14 sm:py-20">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Borrow what you need.
            <br />
            <span className="text-brand-600">Lend what you don&apos;t.</span>
          </h1>
          <p className="mt-4 max-w-xl text-stone-600">
            LendLoop is a lending board for your neighborhood. List the ladder gathering dust in your garage, borrow
            a tent for the weekend, and get friendly reminders when it&apos;s time to give things back.
          </p>
          <div className="mt-8">
            <AuthCta size="lg" />
          </div>
        </section>

        <section className="pb-20">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Available right now</h2>
            {tools && <span className="text-sm text-stone-500">{tools.length} tools</span>}
          </div>

          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <EmptyState title="No tools listed yet">Be the first neighbor to share something.</EmptyState>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map(({ category, items }) => (
                <div key={category} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">{categoryLabel(category)}</h3>
                    <Badge>{items.length}</Badge>
                  </div>
                  <ul className="space-y-1.5 text-sm text-stone-700">
                    {items.slice(0, 8).map((t) => (
                      <li key={t._id} className="truncate">
                        {t.name}
                      </li>
                    ))}
                    {items.length > 8 && <li className="text-stone-400">+ {items.length - 8} more</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        LendLoop — a neighborhood tool library
      </footer>
    </div>
  );
}
