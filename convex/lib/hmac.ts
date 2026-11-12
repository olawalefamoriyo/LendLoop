/**
 * HMAC-SHA256 request signing shared by both directions of the n8n integration.
 *
 * Wire format (both directions):
 *   X-LendLoop-Timestamp: <unix ms>
 *   X-LendLoop-Signature: sha256=<hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))>
 *
 * Including the timestamp in the signed string and rejecting stale timestamps
 * limits replay to a short window; every receiving endpoint is idempotent, so
 * a replay inside that window is harmless.
 *
 * Uses Web Crypto only, so it runs in the Convex runtime, Node, and tests.
 */

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signBody(secret: string, rawBody: string, timestamp: number) {
  const hex = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return {
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: `sha256=${hex}`,
  };
}

/** Constant-time comparison so response timing doesn't leak signature bytes. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "stale_timestamp" | "bad_signature" };

export async function verifySignature(opts: {
  secret: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}): Promise<VerifyResult> {
  const { secret, rawBody, timestamp, signature } = opts;
  const now = opts.now ?? Date.now();
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_TOLERANCE_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = `sha256=${await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
  return timingSafeEqual(expected, signature.trim().toLowerCase())
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
