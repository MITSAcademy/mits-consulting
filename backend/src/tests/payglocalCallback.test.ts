/**
 * PayGlocal callback parsing.
 *
 * PayGlocal's browser callback is a form post with one `x-gl-token` field
 * holding a JWS. The first extractIds only understood bare JSON, so no real
 * callback yielded a transaction id: every buyer was sent back to the website
 * with an empty txn and shown an error, and the purchase stayed PENDING.
 *
 *   Run:  npx jest payglocalCallback
 */

// jose is ESM-only and jest runs CommonJS here; none of these cases need real
// encryption, so the crypto module is stubbed.
jest.mock('../lib/payglocalCrypto', () => ({
  looksLikeJwe: (s: string | null | undefined) => !!s && s.split('.').length === 5,
  decrypt: jest.fn(async () => {
    throw new Error('no key in tests');
  }),
  encrypt: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
  publicKeyFromPem: jest.fn(),
  privateKeyFromPem: jest.fn(),
}));

import { extractIds, isFailedStatus, isPaidStatus } from '../lib/payglocal';

const b64u = (s: string) => Buffer.from(s).toString('base64url');
const jws = (payload: object) =>
  [b64u(JSON.stringify({ alg: 'RS256' })), b64u(JSON.stringify(payload)), b64u('signature')].join('.');

const outcome = { merchantTxnId: 'MITSABC123', gid: 'gl_o-123', status: 'SENT_FOR_CAPTURE' };

describe('extractIds', () => {
  it('reads the form-encoded x-gl-token PayGlocal actually sends', async () => {
    const body = `x-gl-token=${encodeURIComponent(jws(outcome))}`;
    expect(await extractIds(body)).toEqual({ merchantTxnId: 'MITSABC123', gid: 'gl_o-123' });
  });

  it('reads a JSON body wrapping the token', async () => {
    expect(await extractIds(JSON.stringify({ 'x-gl-token': jws(outcome) }))).toEqual({
      merchantTxnId: 'MITSABC123',
      gid: 'gl_o-123',
    });
  });

  it('reads a bare JWS and plain JSON', async () => {
    expect((await extractIds(jws(outcome))).merchantTxnId).toBe('MITSABC123');
    expect((await extractIds(JSON.stringify({ data: outcome }))).gid).toBe('gl_o-123');
  });

  it('returns nulls, without throwing, for anything unreadable', async () => {
    for (const body of ['', '   ', 'not a token', 'x-gl-token=a.b.c', '{broken', 'a=b&c=d']) {
      expect(await extractIds(body)).toEqual({ merchantTxnId: null, gid: null });
    }
  });
});

describe('payment status mapping', () => {
  it('treats issuer declines, cancels and timeouts as failed', () => {
    for (const s of ['ISSUER_DECLINE', 'CUSTOMER_CANCELLED', 'AUTHENTICATION_TIMEOUT', 'FAILED', 'REQUEST_ERROR']) {
      expect(isFailedStatus(s)).toBe(true);
      expect(isPaidStatus(s)).toBe(false);
    }
  });

  it('treats sent-for-capture as paid and in-progress as neither', () => {
    expect(isPaidStatus('SENT_FOR_CAPTURE')).toBe(true);
    expect(isPaidStatus('INPROGRESS')).toBe(false);
    expect(isFailedStatus('INPROGRESS')).toBe(false);
    expect(isFailedStatus(null)).toBe(false);
  });
});
