# Running LendLoop in production: what I'd change

This repo is built to be easy to evaluate locally. To run it for real, I'd change the following, roughly in priority order.

## Integration & reliability

- **Exactly-once-ish notifications.** Delivery today is at-least-once. If n8n sends the email but the HTTP response to Convex is lost, Convex retries and the user may get a duplicate. To fix this, n8n should *claim* the `eventId` before sending (a signed `POST /n8n/notification-claim` that returns 409 if the event is already claimed or sent), or dedupe on `eventId` in n8n's own data store.
- **Sweep stale states.** Add a Convex cron that flags notifications stuck in `delivered` with no write-back after N minutes, and reminders whose lease expired with no follow-up run. These should alert, not just display.
- **Alerting, not just a dashboard.** Send `failed` and `workflow_error` rows to Slack or PagerDuty, and add a dead-man's switch: alert if no reminder run has called `/n8n/overdue-loans` in 26 hours. As it stands, a disabled schedule would fail silently.
- **Batch and paginate.** `claimOverdue` takes 100 loans per run. In production I'd loop over pages, or have n8n call it until the result is empty, and batch the write-backs.
- **Queue mode for n8n.** Run n8n with Redis and workers (`EXECUTIONS_MODE=queue`) and Postgres instead of SQLite, so webhook intake survives worker restarts.
- **Version-pin and promote workflows.** Use n8n source control or environments (dev → prod) instead of importing JSON by hand, and check in CI that the exported JSON matches what's deployed.

## Security

- **Secrets management.** Load the HMAC secrets into n8n via **external secrets** (Vault, AWS Secrets Manager or similar) instead of environment variables. Then `N8N_BLOCK_ENV_ACCESS_IN_NODE` can go back to `true`. Rotate the secrets regularly, and support two active secrets during a rotation (verify against both, sign with the new one).
- **Network.** Serve n8n over HTTPS behind a reverse proxy. Expose only `/webhook/lendloop-loan-events` publicly and keep the editor on a VPN or SSO. Optionally restrict the webhook to Convex's egress IPs.
- **Replay protection.** The timestamp window plus idempotent endpoints is enough for this domain. For stricter guarantees, store seen signature nonces for the length of the window.
- **Clerk.** Use production instance keys and enforce verified email (plus MFA for admins). Sync users through Clerk webhooks (Svix-verified) so profile and email changes and deletions propagate, instead of relying on a client-triggered `users.store`.
- **Admin auditing.** Record who removed which listing, toggled Trusted Lender, or retried an automation, and when.
- **Rate limiting.** Limit request creation and listing creation per user (e.g. `@convex-dev/rate-limiter`) to prevent spam and notification flooding.
- **CSP.** Add a Content-Security-Policy tuned for Clerk and Convex.

## Data & privacy

- **Retention.** Apply TTLs to `automationEvents` (e.g. 90 days) and keep the n8n execution pruning in place. Use a real transactional email provider with suppression lists and unsubscribe handling.
- **Right to erasure.** Add a flow that anonymizes a user's loans and removes their profile, triggered by Clerk's `user.deleted` webhook.
- **Time zones.** Loan dates are UTC calendar dates and reminders run at 09:00 UTC. Store a neighborhood or user time zone, and schedule reminders in local time.

## Product & performance

- **Denormalize availability.** Availability is currently computed per tool on each read, an N+1 pattern that's fine at neighborhood scale. Store a `currentLoanId` or availability field on `tools`, updated by the loan mutations, and paginate Browse.
- **Search.** Add a Convex search index on tool names.
- **Notification preferences** (email vs. SMS vs. none), and a "picked up" state separate from "approved".
- **Observability.** Use structured logs with correlation ids: pass the `eventId` and n8n execution id through every hop, and forward Convex log streams to the team's logging stack.
- **CI.** Run lint, typecheck and tests on every PR, then `npx convex deploy` and the Vercel deploy on main. Add a smoke test against a preview deployment.
