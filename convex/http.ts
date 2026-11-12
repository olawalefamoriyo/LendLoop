/**
 * HTTP endpoints called by n8n. Every route:
 *  1. caps the body size,
 *  2. verifies the HMAC signature + timestamp (N8N_TO_LENDLOOP_SECRET),
 *  3. strictly validates the JSON body against the same validators the
 *     internal mutation uses (unknown fields are rejected -> 400),
 *  4. is idempotent, so n8n's retries are safe.
 * Errors return generic messages; details go to the Convex logs only.
 */
import { httpRouter } from "convex/server";
import { v, type Infer, type PropertyValidators } from "convex/values";
import { validate } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { workflowErrorArgs } from "./admin";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "./lib/hmac";
import { deliveryReportArgs } from "./notifications";
import { claimOverdueArgs, recordStatusArgs } from "./reminders";

const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function signedRoute<P extends PropertyValidators>(
  fields: P,
  handler: (ctx: ActionCtx, args: Infer<ReturnType<typeof v.object<P>>>) => Promise<Response>,
) {
  const schema = v.object(fields);
  type Args = Infer<typeof schema>;
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_LENDLOOP_SECRET;
    if (!secret) {
      console.error("N8N_TO_LENDLOOP_SECRET is not set; rejecting n8n callback.");
      return json(503, { error: "integration_not_configured" });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });

    const verification = await verifySignature({
      secret,
      rawBody,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
    });
    if (!verification.ok) {
      console.warn(`Rejected n8n callback to ${new URL(request.url).pathname}: ${verification.reason}`);
      return json(401, { error: "invalid_signature" });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (!validate(schema, body)) return json(400, { error: "invalid_payload" });

    try {
      return await handler(ctx, body as Args);
    } catch (err) {
      console.error(`n8n callback failed: ${err instanceof Error ? err.message : String(err)}`);
      return json(500, { error: "internal_error" });
    }
  });
}

const http = httpRouter();

/** Daily reminder run: returns (and leases) today's overdue reminders. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signedRoute(claimOverdueArgs, async (ctx, args) =>
    json(200, await ctx.runMutation(internal.reminders.claimOverdue, args)),
  ),
});

/** Reminder write-back. 404 if the key is unknown (visible in n8n, not silently ignored). */
http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedRoute(recordStatusArgs, async (ctx, args) => {
    const result = await ctx.runMutation(internal.reminders.recordStatus, args);
    return json(result.found ? 200 : 404, result);
  }),
});

/** Loan-notification write-back. */
http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signedRoute(deliveryReportArgs, async (ctx, args) => {
    const result = await ctx.runMutation(internal.notifications.recordDeliveryReport, args);
    return json(result.found ? 200 : 404, result);
  }),
});

/** The n8n error workflow reports failed executions here so admins see them in-app. */
http.route({
  path: "/n8n/workflow-error",
  method: "POST",
  handler: signedRoute(workflowErrorArgs, async (ctx, args) =>
    json(200, await ctx.runMutation(internal.admin.recordWorkflowError, args)),
  ),
});

export default http;
