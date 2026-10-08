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
        addressCountry: 'IN',
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

/** Reads a transaction reference out of a callback/webhook body. Never trusted on its own. */
export async function extractIds(rawBody: string): Promise<{ merchantTxnId: string | null; gid: string | null }> {
  if (!rawBody?.trim()) return { merchantTxnId: null, gid: null };
  try {
    const c = await keys();
    const json = JSON.parse(looksLikeJwe(rawBody) ? await decrypt(rawBody, c.privateKey) : rawBody);
    return { merchantTxnId: deepString(json, 'merchantTxnId'), gid: deepString(json, 'gid') };
  } catch (e) {
    console.warn('[payglocal] could not parse callback body:', e);
    return { merchantTxnId: null, gid: null };
  }
}

export function isPaidStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s.includes('SUCCESS') || s.includes('CAPTURED') || s === 'PAID' || s.includes('SENT_FOR_CAPTURE');
}

export function isFailedStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s.includes('FAIL') || s.includes('DECLINED') || s.includes('CANCEL');
}

export { verify as verifyJws };
