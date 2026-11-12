"use client";

import { RedirectToSignIn, useAuth, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Badge, Loading } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/format";

const NAV = [
  { href: "/tools", label: "Browse" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

/** Upserts the Convex user from the Clerk identity, then renders the app. */
function EnsureUser({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const store = useMutation(api.users.store);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store().catch((e) => setError(errorMessage(e)));
  }, [store]);

  if (error) return <p className="text-sm text-red-700">Couldn&apos;t load your profile: {error}</p>;
  if (!me) return <Loading />;
  return <Shell isAdmin={me.role === "admin"} trusted={me.trustedLender}>{children}</Shell>;
}

function Shell({ children, isAdmin, trusted }: { children: ReactNode; isAdmin: boolean; trusted: boolean }) {
  const pathname = usePathname();
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            {trusted && <Badge tone="blue">✓ Trusted Lender</Badge>}
            {isAdmin && <Badge tone="amber">Admin</Badge>}
            <UserButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 sm:px-5" aria-label="Main">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                  active ? "border-brand-600 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}

/**
 * Signed out -> go sign in. Signed in to Clerk but not to Convex means the
 * Convex backend rejected the token: almost always a setup issue, so say so
 * instead of looping on redirects.
 */
function NotAuthenticated() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <RedirectToSignIn />;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-sm text-stone-600">
      <h1 className="mb-2 text-lg font-semibold text-stone-900">Signed in, but the backend didn&apos;t accept it</h1>
      <p>
        Check that the Clerk <code>convex</code> JWT template (or Clerk&apos;s Convex integration) is enabled and that{" "}
        <code>CLERK_JWT_ISSUER_DOMAIN</code> is set on the Convex deployment. See the README.
      </p>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <AuthLoading>
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Loading />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <NotAuthenticated />
      </Unauthenticated>
      <Authenticated>
        <EnsureUser>{children}</EnsureUser>
      </Authenticated>
    </div>
  );
}
