#!/usr/bin/env bash
# Generates the two HMAC secrets + n8n encryption key, writes .env.n8n, and sets
# the matching values on the current Convex deployment. Secrets are never echoed.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.n8n ] && [ "${1:-}" != "--force" ]; then
  echo ".env.n8n already exists. Re-run with --force to rotate secrets." >&2
  exit 1
fi

TO_N8N=$(openssl rand -hex 32)
TO_LENDLOOP=$(openssl rand -hex 32)
ENC_KEY=$(openssl rand -hex 32)

sed -e "s|^N8N_ENCRYPTION_KEY=.*|N8N_ENCRYPTION_KEY=${ENC_KEY}|" \
    -e "s|^LENDLOOP_TO_N8N_SECRET=.*|LENDLOOP_TO_N8N_SECRET=${TO_N8N}|" \
    -e "s|^N8N_TO_LENDLOOP_SECRET=.*|N8N_TO_LENDLOOP_SECRET=${TO_LENDLOOP}|" \
    .env.n8n.example > .env.n8n
chmod 600 .env.n8n
echo "Wrote .env.n8n"

npx convex env set LENDLOOP_TO_N8N_SECRET "$TO_N8N" >/dev/null
npx convex env set N8N_TO_LENDLOOP_SECRET "$TO_LENDLOOP" >/dev/null
npx convex env set N8N_LOAN_EVENTS_WEBHOOK_URL "${N8N_WEBHOOK_URL:-http://localhost:5678/webhook/lendloop-loan-events}" >/dev/null
echo "Set LENDLOOP_TO_N8N_SECRET, N8N_TO_LENDLOOP_SECRET, N8N_LOAN_EVENTS_WEBHOOK_URL on the Convex deployment."
echo "If n8n is already running, restart it: docker compose up -d --force-recreate n8n"
