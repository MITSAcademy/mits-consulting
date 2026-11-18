/**
 * PayGlocal hosted PayCollect checkout.
 *
 * The buyer is sent to PayGlocal's hosted page (server-side initiate →
 * redirect), and PayGlocal reports the outcome twice: a browser POST callback
 * and an independent server-to-server webhook. Neither body is trusted — both
 * paths only extract a transaction id and then re-confirm the real outcome
 * against PayGlocal's status API, so a spoofed callback cannot fake a payment.
 *
 * Wire contract ported from mits-rest (PayGlocalCheckoutService.java).
 */

import { encrypt, sign, decrypt, verify, looksLikeJwe, publicKeyFromPem, privateKeyFromPem } from './payglocalCrypto';
import type { PayGlocalKey } from './payglocalCrypto';


const INITIATE_PATH = '/gl/v1/payments/initiate/paycollect';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function payglocalEnabled(): boolean {
  return env('PAYGLOCAL_ENABLED') === 'true';
}

function config() {
  return {
    baseUrl: env('PAYGLOCAL_BASE_URL') || 'https://api.prod.payglocal.in',
    merchantId: env('PAYGLOCAL_MERCHANT_ID'),
    publicKeyId: env('PAYGLOCAL_PUBLIC_KEY_ID'),
    privateKeyId: env('PAYGLOCAL_PRIVATE_KEY_ID'),
    publicKeyPem: env('PAYGLOCAL_PUBLIC_KEY'),
    privateKeyPem: env('PAYGLOCAL_PRIVATE_KEY'),
    callbackUrl: env('PAYGLOCAL_CALLBACK_URL'),
  };
}

let cachedPublicKey: PayGlocalKey | null = null;
let cachedPrivateKey: PayGlocalKey | null = null;

async function keys() {
  const c = config();
  if (!c.merchantId || !c.publicKeyPem || !c.privateKeyPem) {
    throw new Error('PayGlocal is not configured (merchant id or keys missing)');
  }
  if (!cachedPublicKey) cachedPublicKey = await publicKeyFromPem(c.publicKeyPem);
  if (!cachedPrivateKey) cachedPrivateKey = await privateKeyFromPem(c.privateKeyPem);
  return { ...c, publicKey: cachedPublicKey, privateKey: cachedPrivateKey };
}

/** Pull a value out of a nested JSON response by key, wherever it sits. */
function deepString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (rec[key] != null && typeof rec[key] !== 'object') return String(rec[key]);
  for (const v of Object.values(rec)) {
    const found = deepString(v, key);
    if (found !== null) return found;
  }
  return null;
}

export interface InitiateResult {
  redirectUrl: string;
  gid: string | null;
}

export async function initiatePayCollect(params: {
  merchantTxnId: string;
  amount: number; // minor units
  currency: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  phoneCountryCode?: string | null;
  /** ISO alpha-2. Falls back to IN, the previous fixed value. */
  billingCountry?: string | null;
}): Promise<InitiateResult> {
  const c = await keys();

  // PayGlocal takes a decimal string, while we store minor units.
  const totalAmount = (params.amount / 100).toFixed(2);

  const payload = JSON.stringify({
    merchantTxnId: params.merchantTxnId,
    paymentData: {
      totalAmount,
      txnCurrency: params.currency,
      billingData: {
        firstName: params.firstName,
        lastName: params.lastName,
        emailId: params.email,
        // The buyer's own country: a US card sent with an Indian billing
        // country is more likely to be refused by the issuer's risk checks.
        addressCountry: params.billingCountry || 'IN',
        // Sent so the buyer is identifiable in PayGlocal's own dashboard, not
        // only in ours.
        ...(params.phone
          ? { callingCode: params.phoneCountryCode || '91', phoneNumber: params.phone }
          : {}),
      },
    },
    merchantCallbackURL: c.callbackUrl,
  });

  const jwe = await encrypt(payload, c.publicKey, c.publicKeyId, c.merchantId);
  const jws = await sign(jwe, c.privateKey, c.privateKeyId, c.merchantId);

  const resp = await fetch(c.baseUrl + INITIATE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'x-gl-token-external': jws },
    body: jwe,
  });

  const body = await resp.text();
  if (!resp.ok) {
    console.error(`[payglocal] initiate ${resp.status} for ${params.merchantTxnId}: ${body.slice(0, 400)}`);
    throw new Error(`PayGlocal declined the request (${resp.status})`);
  }

  const json = JSON.parse(looksLikeJwe(body) ? await decrypt(body, c.privateKey) : body);
  const redirectUrl = deepString(json, 'redirectUrl');
  if (!redirectUrl) throw new Error('PayGlocal did not return a redirect URL');

  return { redirectUrl, gid: deepString(json, 'gid') };
}

/** GET the authoritative payment status. The status request signs the request URI. */
export async function fetchStatus(gid: string): Promise<string | null> {
  if (!gid) return null;
  try {
    const c = await keys();
    const requestUri = `/gl/v1/payments/${gid}/status`;
    const jws = await sign(requestUri, c.privateKey, c.privateKeyId, c.merchantId);

    const resp = await fetch(c.baseUrl + requestUri, {
      method: 'GET',
      headers: { 'x-gl-token-external': jws },
    });
    if (!resp.ok) return null;

    const body = await resp.text();
    const json = JSON.parse(looksLikeJwe(body) ? await decrypt(body, c.privateKey) : body);
    return deepString(json, 'status');
  } catch (e) {
    console.error(`[payglocal] status check failed for gid ${gid}:`, e);
    return null;
  }
}

const TOKEN_FIELDS = ['x-gl-token', 'x-gl-token-external'];

/**
 * Turns one string into JSON, whatever wrapping PayGlocal used: plain JSON, a
 * JWE encrypted for us, or a JWS whose middle segment is the base64url JSON
 * outcome. The JWS signature is deliberately not what we rely on: the ids read
 * here are only used to look the payment up, and its real outcome always comes
 * from the status API.
 */
async function decodeToken(value: string, depth = 0): Promise<unknown> {
  const s = value.trim();
  if (!s || depth > 2) return null;
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch { return null; }
  }
  const parts = s.split('.');
  if (parts.length === 5) {
    try {
      const c = await keys();
      return await decodeToken(await decrypt(s, c.privateKey), depth + 1);
    } catch {
      return null;
    }
  }
  if (parts.length === 3) {
    try {
      return await decodeToken(Buffer.from(parts[1], 'base64url').toString('utf8'), depth + 1);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Reads a transaction reference out of a callback/webhook body. Never trusted
 * on its own.
 *
 * PayGlocal's browser callback is a form post with a single `x-gl-token` field
 * holding a JWS. The first version of this only understood bare JSON or JWE, so
 * it found no id in any real callback: every buyer, paid or not, was sent back
 * to the website with an empty transaction id and shown an error, and the
 * purchase stayed PENDING. All known shapes are handled here.
 */
export async function extractIds(rawBody: string): Promise<{ merchantTxnId: string | null; gid: string | null }> {
  const body = rawBody?.trim();
  if (!body) return { merchantTxnId: null, gid: null };

  const candidates: string[] = [body];

  // application/x-www-form-urlencoded: x-gl-token=<jws>
  if (!body.startsWith('{') && body.includes('=')) {
    try {
      const form = new URLSearchParams(body);
      for (const field of TOKEN_FIELDS) {
        const v = form.get(field);
        if (v) candidates.push(v);
      }
    } catch {
      /* not a form body */
    }
  }

  // JSON wrapping the token: {"x-gl-token":"<jws>"}
  if (body.startsWith('{')) {
    try {
      const json = JSON.parse(body);
      for (const field of TOKEN_FIELDS) {
        const v = deepString(json, field);
        if (v) candidates.push(v);
      }
    } catch {
      /* handled by decodeToken below */
    }
  }

  for (const candidate of candidates) {
    const json = await decodeToken(candidate);
    if (!json) continue;
    const merchantTxnId = deepString(json, 'merchantTxnId');
    const gid = deepString(json, 'gid');
    if (merchantTxnId || gid) return { merchantTxnId, gid };
  }

  console.warn(`[payglocal] no transaction id in callback body (${body.length} chars, starts "${body.slice(0, 24)}")`);
  return { merchantTxnId: null, gid: null };
}

export function isPaidStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s.includes('SUCCESS') || s.includes('CAPTURED') || s === 'PAID' || s.includes('SENT_FOR_CAPTURE');
}

export function isFailedStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  // DECLINE, not DECLINED: the issuer outcome is ISSUER_DECLINE, which the
  // longer word missed, leaving declined payments PENDING forever.
  return ['FAIL', 'DECLINE', 'CANCEL', 'REJECT', 'ABANDON', 'TIMEOUT', 'EXPIRE', 'ERROR'].some((w) => s.includes(w));
}

export { verify as verifyJws };
