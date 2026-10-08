/**
 * PayGlocal JWE + JWS request signing.
 *
 * Ported from the Java implementation in mits-rest
 * (com.mits.sol.payglocal.PayGlocalCrypto), which itself follows PayGlocal's
 * reference SDK. The algorithms and header/claim names below are part of
 * PayGlocal's wire contract — do not "tidy" them.
 *
 * A request carries the encrypted payload as a JWE (sent as the body, with
 * Content-Type text/plain) plus a JWS over that JWE in the
 * `x-gl-token-external` header. The payload is encrypted with PayGlocal's
 * public key; the JWS is signed with the merchant's private key. Responses
 * PayGlocal encrypts back are JWEs decrypted with the merchant's private key.
 */

import crypto from 'crypto';
import {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  importPKCS8,
  importSPKI,
  type CryptoKey,
} from 'jose';

const JWE_ALG = 'RSA-OAEP-256';
const JWE_ENC = 'A128CBC-HS256';
const JWS_ALG = 'RS256';
const DIGEST_ALGORITHM = 'SHA-256';
const TOKEN_EXPIRY_MS = 300000; // 5 minutes, per PayGlocal

/**
 * A WebCrypto key is bound to one algorithm, but each PayGlocal key is used for
 * two: the merchant private key both signs (RS256) and decrypts responses
 * (RSA-OAEP-256), and their public key both encrypts and verifies. So each PEM
 * is imported once per algorithm and the pair is carried together.
 */
export interface PayGlocalKey {
  /** RSA-OAEP-256 — encryption/decryption. */
  enc: CryptoKey;
  /** RS256 — signing/verification. */
  sig: CryptoKey;
}

export async function publicKeyFromPem(pem: string): Promise<PayGlocalKey> {
  const normalised = normalisePem(pem, 'PUBLIC KEY');
  return {
    enc: await importSPKI(normalised, JWE_ALG),
    sig: await importSPKI(normalised, JWS_ALG),
  };
}

export async function privateKeyFromPem(pem: string): Promise<PayGlocalKey> {
  const normalised = normalisePem(pem, 'PRIVATE KEY');
  return {
    enc: await importPKCS8(normalised, JWE_ALG),
    sig: await importPKCS8(normalised, JWS_ALG),
  };
}

/** Encrypt the stringified JSON payload — the JWE goes in the request body. */
export async function encrypt(
  payload: string,
  payglocalPublicKey: PayGlocalKey,
  publicKeyId: string,
  merchantId: string,
): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(payload))
    .setProtectedHeader({
      alg: JWE_ALG,
      enc: JWE_ENC,
      kid: publicKeyId,
      iat: String(Date.now()),
      exp: TOKEN_EXPIRY_MS,
      'issued-by': merchantId,
    })
    .encrypt(payglocalPublicKey.enc);
}

/**
 * Sign a payload — the JWE token for an initiate, or a request URI for
 * status/refund. The claim set carries a SHA-256 digest of that payload; the
 * serialized JWS goes in `x-gl-token-external`.
 */
export async function sign(
  payload: string,
  merchantPrivateKey: PayGlocalKey,
  privateKeyId: string,
  merchantId: string,
): Promise<string> {
  const digest = crypto.createHash('sha256').update(payload).digest('base64');
  // CompactSign rather than SignJWT: PayGlocal expects `iat` as a string of
  // epoch millis and `exp` as a duration, which SignJWT would coerce to the
  // standard numeric JWT claims and break the signature contract.
  const claims = JSON.stringify({
    digest,
    digestAlgorithm: DIGEST_ALGORITHM,
    iat: String(Date.now()),
    exp: TOKEN_EXPIRY_MS,
  });
  return new CompactSign(new TextEncoder().encode(claims))
    .setProtectedHeader({
      alg: JWS_ALG,
      kid: privateKeyId,
      'x-gl-merchantId': merchantId,
      'x-gl-enc': 'true',
      'issued-by': merchantId,
      'is-digested': 'true',
    })
    .sign(merchantPrivateKey.sig);
}

/** Decrypt a JWE PayGlocal encrypted for us (callback/response). */
export async function decrypt(jweToken: string, merchantPrivateKey: PayGlocalKey): Promise<string> {
  const { plaintext } = await compactDecrypt(jweToken, merchantPrivateKey.enc);
  return new TextDecoder().decode(plaintext);
}

/** Verify a JWS from PayGlocal against their public key. */
export async function verify(jwsToken: string, payglocalPublicKey: PayGlocalKey): Promise<boolean> {
  try {
    await compactVerify(jwsToken, payglocalPublicKey.sig, { algorithms: [JWS_ALG] });
    return true;
  } catch {
    return false;
  }
}

/** A compact JWE has five dot-separated parts; a JWS has three. */
export function looksLikeJwe(s: string | null | undefined): boolean {
  return !!s && s.split('.').length === 5;
}

/**
 * Accepts a key as raw base64 or full PEM, with real or escaped newlines —
 * env vars routinely mangle one into the other.
 */
function normalisePem(pem: string, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  const trimmed = pem.trim().replace(/\\n/g, '\n');
  if (trimmed.includes('-----BEGIN')) return trimmed;
  const body = trimmed.replace(/\s/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}
