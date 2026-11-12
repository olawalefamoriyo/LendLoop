// @vitest-environment node
/**
 * Contract tests between Convex and the exported n8n workflows.
 * Executes the *actual* Code-node JavaScript from the workflow JSON in a small
 * harness that mimics n8n's globals, and checks it interoperates with the
 * Convex signing/verification code.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";
import { workflowErrorArgs } from "../convex/admin";
import { signBody, verifySignature } from "../convex/lib/hmac";
import { deliveryReportArgs } from "../convex/notifications";
import { recordStatusArgs } from "../convex/reminders";

const require = createRequire(import.meta.url);
const DIR = join(__dirname, "..", "n8n", "workflows");

type N8nNode = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  retryOnFail?: boolean;
  credentials?: Record<string, { id: string; name: string }>;
};
type Workflow = { id: string; name: string; nodes: N8nNode[]; settings: Record<string, unknown> };

const workflows: Record<string, Workflow> = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), "utf8"))]),
);
const wf = (file: string) => workflows[file];
const codeOf = (file: string, nodeName: string) => {
  const node = wf(file).nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`${nodeName} not found in ${file}`);
  return node.parameters.jsCode as string;
};

type Item = { json: Record<string, unknown>; binary?: Record<string, unknown> };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Run a Code node ("run once for all items") with n8n-like globals. */
async function runCode(
  jsCode: string,
  items: Item[],
  opts: { env?: Record<string, string>; rawBinary?: Buffer; nodes?: Record<string, Item> } = {},
) {
  const ctx = { helpers: { getBinaryDataBuffer: async () => opts.rawBinary } };
  const $input = { first: () => items[0], all: () => items };
  const $ = (name: string) => ({ first: () => opts.nodes?.[name], item: opts.nodes?.[name] });
  const fn = new AsyncFunction("require", "$env", "$input", "$json", "$execution", "$", jsCode);
  return fn.call(ctx, require, opts.env ?? {}, $input, items[0]?.json, { id: "4242" }, $);
}

const OUT = "lendloop-to-n8n";
const IN = "n8n-to-lendloop";
const ENV = { LENDLOOP_TO_N8N_SECRET: OUT, N8N_TO_LENDLOOP_SECRET: IN, LENDLOOP_APP_URL: "http://app.test" };

const samplePayload = {
  eventId: "notif:abc:request_approved",
  type: "request_approved",
  occurredAt: "2026-11-12T08:00:00.000Z",
  recipient: { email: "bob@example.com", firstName: "Bob" },
  counterpartFirstName: "Alice",
  loan: { id: "abc", toolName: "Cordless drill", startDate: "2026-11-14", endDate: "2026-11-16" },
};

async function webhookItem(body: string, headers: Record<string, string>): Promise<Item> {
  return { json: { headers, body: JSON.parse(body) }, binary: { data: {} } };
}

describe("loan-notification workflow ⇄ Convex", () => {
  const FILE = "lendloop-loan-notifications.json";

  test("accepts a payload signed by Convex (raw body and parsed-body fallback)", async () => {
    const body = JSON.stringify(samplePayload);
    const headers = await signBody(OUT, body, Date.now());
    const item = await webhookItem(body, headers);

    const viaRaw = await runCode(codeOf(FILE, "Verify signature"), [item], { env: ENV, rawBinary: Buffer.from(body) });
    expect(viaRaw[0].json).toEqual({ valid: true, event: samplePayload });

    const viaParsed = await runCode(codeOf(FILE, "Verify signature"), [{ json: item.json }], { env: ENV });
    expect(viaParsed[0].json.valid).toBe(true);
  });

  test("rejects tampering, wrong secret and stale timestamps", async () => {
    const body = JSON.stringify(samplePayload);
    const verify = (raw: string, headers: Record<string, string>) =>
      runCode(codeOf(FILE, "Verify signature"), [{ json: { headers, body: JSON.parse(raw) } }], { env: ENV, rawBinary: Buffer.from(raw) });

    const tampered = body.replace("bob@example.com", "eve@example.com");
    expect((await verify(tampered, await signBody(OUT, body, Date.now())))[0].json.reason).toBe("bad_signature");
    expect((await verify(body, await signBody("wrong", body, Date.now())))[0].json.reason).toBe("bad_signature");
    expect((await verify(body, await signBody(OUT, body, Date.now() - 10 * 60_000)))[0].json.reason).toBe("stale_timestamp");
    expect((await verify(body, {}))[0].json.reason).toBe("missing_headers");
  });

  test("fails loudly if the secret is not configured", async () => {
    await expect(runCode(codeOf(FILE, "Verify signature"), [{ json: { headers: {}, body: {} } }])).rejects.toThrow(
      /not configured/,
    );
  });

  test("composes an email for every event type", async () => {
    for (const type of ["request_created", "request_approved", "request_declined", "request_cancelled", "loan_returned", "listing_removed"]) {
      const [out] = await runCode(codeOf(FILE, "Compose message"), [{ json: { event: { ...samplePayload, type } } }], { env: ENV });
      expect(out.json.to).toBe("bob@example.com");
      expect(out.json.subject).toMatch(/^\[LendLoop\]/);
      expect(out.json.text).toContain("Hi Bob");
    }
  });

  test("write-back is signed so Convex accepts it, and matches Convex's validator", async () => {
    const compose = { json: { eventId: samplePayload.eventId } };
    const [report] = await runCode(codeOf(FILE, "Report sent"), [{ json: {} }], { nodes: { "Compose message": compose } });
    expect(validate(v.object(deliveryReportArgs), report.json.payload)).toBe(true);

    const [failed] = await runCode(codeOf(FILE, "Report failed"), [{ json: { error: { message: "SMTP down" } } }], {
      nodes: { "Compose message": compose },
    });
    expect(failed.json.payload).toMatchObject({ status: "failed", error: "SMTP down" });
    expect(validate(v.object(deliveryReportArgs), failed.json.payload)).toBe(true);

    const [signed] = await runCode(codeOf(FILE, "Sign write-back"), [report], { env: ENV });
    const ok = await verifySignature({
      secret: IN,
      rawBody: signed.json.body,
      timestamp: signed.json.timestamp,
      signature: signed.json.signature,
    });
    expect(ok).toEqual({ ok: true });
  });
});

describe("overdue-reminder workflow ⇄ Convex", () => {
  const FILE = "lendloop-overdue-reminders.json";

  test("reminder write-back matches Convex's validator", async () => {
    const reminder = {
      reminderKey: "reminder:abc:2026-11-12",
      recipient: { email: "bob@example.com", firstName: "Bob" },
      lenderFirstName: "Alice",
      toolName: "Tent",
      dueDate: "2026-11-10",
      daysOverdue: 2,
    };
    // "Run once for each item" nodes return a single item, not an array.
    const composed = await runCode(codeOf(FILE, "Compose reminder"), [{ json: reminder }], { env: ENV });
    expect(composed.json).toMatchObject({ to: "bob@example.com", reminderKey: reminder.reminderKey });
    expect(composed.json.text).toContain("2 days ago");

    const sent = await runCode(codeOf(FILE, "Mark sent"), [{ json: {} }], { nodes: { "Compose reminder": composed } });
    expect(validate(v.object(recordStatusArgs), sent.json.payload)).toBe(true);
  });
});

describe("error workflow ⇄ Convex", () => {
  test("error report matches Convex's validator and carries no run data", async () => {
    const errorTriggerOutput = {
      execution: {
        id: "99",
        url: "http://localhost:5678/workflow/LLOverdueRemind1/executions/99",
        lastNodeExecuted: "Fetch overdue loans",
        error: { message: "connect ECONNREFUSED" },
        mode: "trigger",
      },
      workflow: { id: "LLOverdueRemind1", name: "LendLoop · Overdue reminders" },
    };
    const [out] = await runCode(codeOf("lendloop-error-handler.json", "Build error report"), [{ json: errorTriggerOutput }]);
    expect(validate(v.object(workflowErrorArgs), out.json.payload)).toBe(true);
  });
});

describe("email delivery over HTTP (Brevo in production, Mailpit locally)", () => {
  // Every node that composes an email, with an input that makes it produce one.
  const COMPOSERS: { file: string; node: string; input: Item }[] = [
    {
      file: "lendloop-loan-notifications.json",
      node: "Compose message",
      input: { json: { event: samplePayload } },
    },
    {
      file: "lendloop-overdue-reminders.json",
      node: "Compose reminder",
      input: {
        json: {
          reminderKey: "reminder:abc:2026-11-12",
          recipient: { email: "bob@example.com", firstName: "Bob" },
          lenderFirstName: "Alice",
          toolName: "Tent",
          dueDate: "2026-11-10",
          daysOverdue: 2,
        },
      },
    },
    {
      file: "lendloop-error-handler.json",
      node: "Compose ops alert",
      input: { json: { payload: { workflowName: "LendLoop · Overdue reminders", executionId: "9", message: "boom" } } },
    },
  ];
  const composed = async (c: (typeof COMPOSERS)[number], env: Record<string, string>) => {
    const out = await runCode(codeOf(c.file, c.node), [c.input], { env });
    return (Array.isArray(out) ? out[0] : out).json;
  };

  test("builds a Brevo API request when LENDLOOP_MAIL_API=brevo", async () => {
    const env = { ...ENV, LENDLOOP_MAIL_API: "brevo", LENDLOOP_MAIL_FROM: "LendLoop <hello@example.org>", LENDLOOP_OPS_EMAIL: "ops@example.org" };
    for (const c of COMPOSERS) {
      const json = await composed(c, env);
      expect(json.mail.url, c.node).toBe("https://api.brevo.com/v3/smtp/email");
      expect(json.mail.body, c.node).toEqual({
        sender: { name: "LendLoop", email: "hello@example.org" },
        to: [{ email: json.to }],
        subject: json.subject,
        textContent: json.text,
      });
    }
  });

  test("defaults to Mailpit's send API (and accepts a bare sender address)", async () => {
    const env = { ...ENV, LENDLOOP_MAIL_FROM: "no-reply@lendloop.local", LENDLOOP_OPS_EMAIL: "ops@lendloop.local" };
    for (const c of COMPOSERS) {
      const json = await composed(c, env);
      expect(json.mail.url, c.node).toBe("http://mailpit:8025/api/v1/send");
      expect(json.mail.body, c.node).toEqual({
        From: { Email: "no-reply@lendloop.local", Name: "LendLoop" },
        To: [{ Email: json.to }],
        Subject: json.subject,
        Text: json.text,
      });
    }
  });

  test("send nodes authenticate via a credential, time out, and route failures", () => {
    const senders = Object.values(workflows).flatMap((w) =>
      w.nodes.filter((n) => n.parameters.url === "={{ $json.mail.url }}").map((n) => ({ w, n })),
    );
    expect(senders).toHaveLength(3);
    for (const { w, n } of senders) {
      const label = `${w.name} / ${n.name}`;
      expect(n.parameters.genericAuthType, label).toBe("httpHeaderAuth");
      expect(n.credentials?.httpHeaderAuth?.name, label).toBe("LendLoop Mail API");
      expect((n.parameters.options as { timeout?: number }).timeout, label).toBeGreaterThan(0);
      expect(JSON.stringify(n.parameters), label).not.toMatch(/api-key/i);
      expect((n as N8nNode & { onError?: string }).onError, label).toBeDefined();
    }
  });
});

describe("workflow JSON hygiene", () => {
  const all = Object.entries(workflows);

  test("no secrets or credential data in exported JSON", () => {
    for (const [file, w] of all) {
      const text = JSON.stringify(w);
      expect(text, file).not.toMatch(/sk_(test|live)_|whsec_|xkeysib-|-----BEGIN|password"\s*:\s*"[^"]/i);
      for (const n of w.nodes) {
        for (const cred of Object.values(n.credentials ?? {})) expect(Object.keys(cred).sort()).toEqual(["id", "name"]);
      }
    }
  });

  test("every non-handler workflow routes failures to the error workflow", () => {
    const handler = wf("lendloop-error-handler.json");
    for (const [file, w] of all) {
      if (w.id === handler.id) continue;
      expect(w.settings.errorWorkflow, file).toBe(handler.id);
    }
  });

  test("every external call (HTTP, email) retries", () => {
    for (const [, w] of all) {
      for (const n of w.nodes.filter((n) => /httpRequest|emailSend/.test(n.type))) {
        expect(n.retryOnFail, `${w.name} / ${n.name}`).toBe(true);
      }
    }
  });
});
