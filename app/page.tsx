"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Footer } from "@/components/Footer";
import { CategoryIcon, Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, LinkButton, Loading } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES } from "@/convex/lib/domain";
import { categoryLabel } from "@/lib/format";

/**
 * Driven by Clerk's own session (not Convex's), so a signed-in user is never
 * offered a sign-in modal — Clerk refuses to open it in single-session mode.
 */
function AuthCta({ size = "md" }: { size?: "md" | "lg" }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <Button variant="secondary" size={size} disabled>
        Loading…
      </Button>
    );
  }
  if (isSignedIn) {
    return (
      <LinkButton href="/tools" size={size}>
        Open LendLoop <Icon name="arrowRight" />
      </LinkButton>
    );
  }
  return (
    <SignInButton mode="modal" forceRedirectUrl="/tools">
      <Button size={size}>
        {size === "lg" ? "Start lending & borrowing" : "Sign in"} <Icon name="arrowRight" />
      </Button>
    </SignInButton>
  );
}

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "box", title: "List what you own", body: "Add the drill, ladder or tent that sits unused most of the year." },
  { icon: "handshake", title: "Neighbors request it", body: "Pick dates, add a note. You approve or decline in one tap." },
  { icon: "bell", title: "Friendly reminders", body: "Everyone gets notified, and late returns get a gentle nudge." },
];

export default function LandingPage() {
  const tools = useQuery(api.tools.listPublic);

  const grouped = useMemo(() => {
    if (!tools) return [];
    return CATEGORIES.map((c) => ({ category: c, items: tools.filter((t) => t.category === c) })).filter(
      (g) => g.items.length > 0,
    );
  }, [tools]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative overflow-hidden">
        {/* soft brand glow behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[36rem] bg-[radial-gradient(60%_50%_at_30%_30%,var(--color-brand-100),transparent_70%),radial-gradient(40%_40%_at_80%_20%,#fde68a55,transparent_70%)]"
        />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo />
          <AuthCta />
        </header>

        <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-card ring-1 ring-brand-100">
            <Icon name="sprout" className="size-3.5" /> Share more, buy less
          </span>
          <h1 className="mt-5 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight text-stone-900 sm:text-6xl">
            Borrow what you need.
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-emerald-500 bg-clip-text text-transparent">
              Lend what you don&apos;t.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
            LendLoop is a lending board for your neighborhood. List the ladder gathering dust in your garage, borrow a
            tent for the weekend, and get friendly reminders when it&apos;s time to give things back.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <AuthCta size="lg" />
            {tools && tools.length > 0 && (
              <span className="text-sm text-stone-500">
                <strong className="text-stone-800">{tools.length}</strong> tools shared so far
              </span>
            )}
          </div>
        </section>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-stone-200/80">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={s.icon} className="size-5" />
                </span>
                <span className="text-sm font-bold text-stone-300">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold text-stone-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">{s.body}</p>
            </div>
          ))}
        </section>

        <section className="pb-24">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Available right now</h2>
              <p className="mt-1 text-stone-500">A peek at what your neighbors are sharing.</p>
            </div>
          </div>

          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <EmptyState title="No tools listed yet" icon="box">
              Be the first neighbor to share something.
            </EmptyState>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map(({ category, items }) => (
                <div key={category} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-stone-200/80">
                  <div className="mb-4 flex items-center gap-3">
                    <CategoryIcon category={category} />
                    <div>
                      <h3 className="font-bold text-stone-900">{categoryLabel(category)}</h3>
                      <p className="text-xs text-stone-500">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-stone-700">
                    {items.slice(0, 6).map((t) => (
                      <li key={t._id} className="flex items-center gap-2 truncate">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand-400" />
                        {t.name}
                      </li>
                    ))}
                    {items.length > 6 && <li className="pl-3.5 text-stone-400">+ {items.length - 6} more</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
