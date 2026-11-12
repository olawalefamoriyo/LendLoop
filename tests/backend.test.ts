/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { addDays, todayUtc } from "../convex/lib/domain";
import { signBody, verifySignature } from "../convex/lib/hmac";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const IN_SECRET = "n8n-to-lendloop-test-secret";
const OUT_SECRET = "lendloop-to-n8n-test-secret";

function setup() {
  const t = convexTest(schema, modules);
  const as = (handle: string, email = `${handle}@example.com`) =>
    t.withIdentity({
      tokenIdentifier: `test|${handle}`,
      subject: handle,
      name: `${handle[0].toUpperCase()}${handle.slice(1)} Tester`,
      email,
      emailVerified: true,
    });
  return { t, as };
}

async function signIn(user: ReturnType<ReturnType<typeof setup>["as"]>) {
  return (await user.mutation(api.users.store, {})) as Id<"users">;
}

const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V, two batteries" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.ADMIN_EMAILS = "admin@example.com";
  process.env.N8N_TO_LENDLOOP_SECRET = IN_SECRET;
  delete process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
  delete process.env.LENDLOOP_TO_N8N_SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HMAC signing", () => {
  test("round-trips and rejects tampering / stale timestamps", async () => {
    const body = JSON.stringify({ hello: "world" });
    const now = Date.now();
    const headers = await signBody("s3cret", body, now);
    const ts = headers["x-lendloop-timestamp"];
    const sig = headers["x-lendloop-signature"];

    expect(await verifySignature({ secret: "s3cret", rawBody: body, timestamp: ts, signature: sig, now })).toEqual({ ok: true });
    expect((await verifySignature({ secret: "s3cret", rawBody: body + " ", timestamp: ts, signature: sig, now })).ok).toBe(false);
    expect((await verifySignature({ secret: "other", rawBody: body, timestamp: ts, signature: sig, now })).ok).toBe(false);
    expect(await verifySignature({ secret: "s3cret", rawBody: body, timestamp: ts, signature: sig, now: now + 6 * 60_000 })).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
    expect(await verifySignature({ secret: "s3cret", rawBody: body, timestamp: null, signature: sig, now })).toEqual({
      ok: false,
      reason: "missing_headers",
    });
  });
});

describe("role-based access control (enforced in Convex)", () => {
  test("anonymous callers can only use the public listing", async () => {
    const { t } = setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/i);
    await expect(t.mutation(api.tools.create, drill)).rejects.toThrow(/sign in/i);
    await expect(t.query(api.tools.listPublic, {})).resolves.toEqual([]);
  });

  test("public listing exposes only id, name and category", async () => {
    const { t, as } = setup();
    const alice = as("alice");
    await signIn(alice);
    await alice.mutation(api.tools.create, drill);
    const [item] = await t.query(api.tools.listPublic, {});
    expect(Object.keys(item).sort()).toEqual(["_id", "category", "name"]);
  });

  test("users can only edit/delete their own listings; admins can remove any", async () => {
    const { as } = setup();
    const alice = as("alice");
    const bob = as("bob");
    const admin = as("admin");
    await signIn(alice);
    await signIn(bob);
    await signIn(admin);
    const toolId = await alice.mutation(api.tools.create, drill);

    await expect(bob.mutation(api.tools.update, { toolId, ...drill, name: "Mine now" })).rejects.toThrow(/own listings/);
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/own listings/);
    // Admins moderate by removing, not editing.
    await expect(admin.mutation(api.tools.update, { toolId, ...drill, name: "Edited" })).rejects.toThrow(/own listings/);
    await admin.mutation(api.tools.remove, { toolId });
    expect(await alice.query(api.tools.mine, {})).toEqual([]);
  });

  test("admin endpoints reject regular users; admin role comes only from verified allowlist", async () => {
    const { as } = setup();
    const bob = as("bob");
    const bobId = await signIn(bob);
    await expect(bob.query(api.admin.listLoans, {})).rejects.toThrow(/Admins only/);
    await expect(bob.mutation(api.admin.setTrustedLender, { userId: bobId, trusted: true })).rejects.toThrow(/Admins only/);

    const admin = as("admin");
    await signIn(admin);
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
    await admin.mutation(api.admin.setTrustedLender, { userId: bobId, trusted: true });
    expect((await bob.query(api.users.me, {}))?.trustedLender).toBe(true);
  });

  test("unverified email on the allowlist does not grant admin", async () => {
    const { t } = setup();
    const sneaky = t.withIdentity({ tokenIdentifier: "test|sneaky", email: "admin@example.com", emailVerified: false });
    await sneaky.mutation(api.users.store, {});
    expect((await sneaky.query(api.users.me, {}))?.role).toBe("user");
  });

  test("only the owner can decide or mark returned; only the borrower can cancel", async () => {
    const { as } = setup();
    const alice = as("alice");
    const bob = as("bob");
    const carol = as("carol");
    await Promise.all([signIn(alice), signIn(bob), signIn(carol)]);
    const toolId = await alice.mutation(api.tools.create, drill);
    const today = todayUtc();

    await expect(alice.mutation(api.loans.request, { toolId, startDate: today, endDate: today })).rejects.toThrow(/own tool/);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: today, endDate: addDays(today, 2) });

    await expect(bob.mutation(api.loans.decide, { loanId, decision: "approve" })).rejects.toThrow(/owner/);
    await expect(carol.mutation(api.loans.decide, { loanId, decision: "approve" })).rejects.toThrow(/owner/);
    await expect(carol.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/your own requests/);

    await alice.mutation(api.loans.decide, { loanId, decision: "approve" });
    await expect(bob.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/lender/);
    await alice.mutation(api.loans.markReturned, { loanId });

    const [mine] = await bob.query(api.loans.myRequests, {});
    expect(mine.status).toBe("returned");
    // Carol isn't a participant and sees nothing.
    expect(await carol.query(api.loans.incoming, {})).toEqual([]);
    expect(await carol.query(api.loans.myRequests, {})).toEqual([]);
  });

  test("approving auto-declines overlapping requests and blocks double booking", async () => {
    const { as } = setup();
    const [alice, bob, carol] = [as("alice"), as("bob"), as("carol")];
    await Promise.all([signIn(alice), signIn(bob), signIn(carol)]);
    const toolId = await alice.mutation(api.tools.create, drill);
    const d = (n: number) => addDays(todayUtc(), n);

    const bobLoan = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    await carol.mutation(api.loans.request, { toolId, startDate: d(2), endDate: d(4) });
    const res = await alice.mutation(api.loans.decide, { loanId: bobLoan, decision: "approve" });
    expect(res.autoDeclined).toBe(1);
    await expect(carol.mutation(api.loans.request, { toolId, startDate: d(3), endDate: d(5) })).rejects.toThrow(/already booked/);
  });

  test("counterpart email is revealed only after approval", async () => {
    const { as } = setup();
    const [alice, bob] = [as("alice"), as("bob")];
    await Promise.all([signIn(alice), signIn(bob)]);
    const toolId = await alice.mutation(api.tools.create, drill);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: todayUtc(), endDate: todayUtc() });
    expect((await bob.query(api.loans.myRequests, {}))[0].counterpart.email).toBeUndefined();
    await alice.mutation(api.loans.decide, { loanId, decision: "approve" });
    expect((await bob.query(api.loans.myRequests, {}))[0].counterpart.email).toBe("alice@example.com");
  });
});

describe("notification webhook (Convex -> n8n)", () => {
  test("signs a minimal payload, then accepts an idempotent write-back", async () => {
    process.env.N8N_LOAN_EVENTS_WEBHOOK_URL = "https://n8n.test/webhook/lendloop-loan-events";
    process.env.LENDLOOP_TO_N8N_SECRET = OUT_SECRET;
    const calls: { headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ headers: init.headers as Record<string, string>, body: init.body as string });
        return new Response("{}", { status: 202 });
      }),
    );

    const { t, as } = setup();
    const [alice, bob] = [as("alice"), as("bob")];
    await Promise.all([signIn(alice), signIn(bob)]);
    const toolId = await alice.mutation(api.tools.create, drill);
    await bob.mutation(api.loans.request, { toolId, startDate: todayUtc(), endDate: todayUtc(), note: "private note" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    const { headers, body } = calls[0];
    const verified = await verifySignature({
      secret: OUT_SECRET,
      rawBody: body,
      timestamp: headers["x-lendloop-timestamp"],
      signature: headers["x-lendloop-signature"],
    });
    expect(verified.ok).toBe(true);

    const payload = JSON.parse(body);
    expect(payload.type).toBe("request_created");
    expect(payload.recipient).toEqual({ email: "alice@example.com", firstName: "Alice" });
    expect(Object.keys(payload).sort()).toEqual(["counterpartFirstName", "eventId", "loan", "occurredAt", "recipient", "type"]);
    expect(body).not.toContain("bob@example.com"); // counterpart's email never leaves Convex
    expect(body).not.toContain("private note");

    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.notifications.recordDeliveryReport, { eventId: payload.eventId, status: "sent" });
    }
    await t.mutation(internal.notifications.recordDeliveryReport, { eventId: payload.eventId, status: "failed" });
    const [loan] = await bob.query(api.loans.myRequests, {});
    expect(loan.activity.filter((a) => a.kind === "notification")).toMatchObject([{ status: "sent" }]);
  });

  test("retries with backoff then marks failed", async () => {
    process.env.N8N_LOAN_EVENTS_WEBHOOK_URL = "https://n8n.test/webhook/x";
    process.env.LENDLOOP_TO_N8N_SECRET = OUT_SECRET;
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { t, as } = setup();
    const [alice, bob] = [as("alice"), as("bob")];
    await Promise.all([signIn(alice), signIn(bob)]);
    const toolId = await alice.mutation(api.tools.create, drill);
    await bob.mutation(api.loans.request, { toolId, startDate: todayUtc(), endDate: todayUtc() });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const health = await as("admin").query(api.admin.automationHealth, {}).catch(async () => {
      await signIn(as("admin"));
      return as("admin").query(api.admin.automationHealth, {});
    });
    expect(health.failed[0]).toMatchObject({ status: "failed", attempts: 5, lastError: "n8n responded HTTP 503" });
  });
});

describe("overdue reminders (n8n -> Convex)", () => {
  async function seedOverdueLoan() {
    const { t, as } = setup();
    const [alice, bob] = [as("alice"), as("bob")];
    const aliceId = await signIn(alice);
    const bobId = await signIn(bob);
    const toolId = await alice.mutation(api.tools.create, drill);
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        ownerId: aliceId,
        borrowerId: bobId,
        startDate: addDays(todayUtc(), -5),
        endDate: addDays(todayUtc(), -2),
        status: "approved",
      }),
    );
    return { t, bob };
  }

  async function signedPost(t: ReturnType<typeof setup>["t"], path: string, payload: unknown, secret = IN_SECRET) {
    const body = JSON.stringify(payload);
    return t.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await signBody(secret, body, Date.now())) },
      body,
    });
  }

  test("rejects unsigned or wrongly signed calls", async () => {
    const { t } = await seedOverdueLoan();
    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);
    expect((await signedPost(t, "/n8n/overdue-loans", { runId: "1" }, "wrong")).status).toBe(401);
  });

  test("leases reminders so a re-run cannot double-send, and write-back is idempotent", async () => {
    const { t, bob } = await seedOverdueLoan();

    const first = await (await signedPost(t, "/n8n/overdue-loans", { runId: "run-1" })).json();
    expect(first.count).toBe(1);
    expect(first.reminders[0]).toMatchObject({ daysOverdue: 2, recipient: { email: "bob@example.com", firstName: "Bob" } });

    const second = await (await signedPost(t, "/n8n/overdue-loans", { runId: "run-2" })).json();
    expect(second.count).toBe(0); // still leased to run-1

    const key = first.reminders[0].reminderKey;
    for (let i = 0; i < 3; i++) {
      const res = await signedPost(t, "/n8n/reminder-status", { reminderKey: key, status: "sent", executionId: "run-1" });
      expect(res.status).toBe(200);
    }
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.filter((e) => e.kind === "reminder")).toHaveLength(1);

    // After the lease would have expired, a sent reminder is still not re-issued today.
    vi.advanceTimersByTime(60 * 60 * 1000);
    const third = await (await signedPost(t, "/n8n/overdue-loans", { runId: "run-3" })).json();
    expect(third.count).toBe(0);

    const [loan] = await bob.query(api.loans.myRequests, {});
    expect(loan.overdue).toBe(true);
    expect(loan.activity[0]).toMatchObject({ kind: "reminder", status: "sent" });
  });

  test("an expired lease without write-back is retried on the next run", async () => {
    const { t } = await seedOverdueLoan();
    await signedPost(t, "/n8n/overdue-loans", { runId: "crashed-run" });
    vi.advanceTimersByTime(16 * 60 * 1000);
    const retry = await (await signedPost(t, "/n8n/overdue-loans", { runId: "run-2" })).json();
    expect(retry.count).toBe(1);
  });

  test("rejects malformed write-backs with 400", async () => {
    const { t } = await seedOverdueLoan();
    const res = await signedPost(t, "/n8n/reminder-status", { reminderKey: "x", status: "bogus" });
    expect(res.status).toBe(400);
  });
});
