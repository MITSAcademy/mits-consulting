/**
 * Custom-amount payments: amount parsing and limits.
 *
 * The amount here is typed by a payer, so parsing must never guess. Anything
 * that is not a plain positive amount with at most two decimals is refused,
 * and nothing under $5 or over $10,000 is accepted.
 *
 *   Run:  npx jest customPayments
 */

// The module under test imports the gateway and mailer; neither is exercised here.
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/payglocal', () => ({ fetchStatus: jest.fn(), isPaidStatus: jest.fn(), isFailedStatus: jest.fn() }));
jest.mock('../lib/mailer', () => ({ sendEmail: jest.fn(), safeBuildFromUser: jest.fn() }));

import {
  CUSTOM_MAX_MINOR,
  CUSTOM_MIN_MINOR,
  amountError,
  isCustomTxnId,
  newCustomTxnId,
  parseAmountToMinor,
} from '../lib/customPayments';

describe('parseAmountToMinor', () => {
  it('reads plain amounts into cents without float error', () => {
    expect(parseAmountToMinor('550')).toBe(55000);
    expect(parseAmountToMinor('550.5')).toBe(55050);
    expect(parseAmountToMinor('550.05')).toBe(55005);
    expect(parseAmountToMinor(' $1,250.00 ')).toBe(125000);
    expect(parseAmountToMinor(19.99)).toBe(1999);
    expect(parseAmountToMinor('0.29')).toBe(29);
    expect(parseAmountToMinor('1.15')).toBe(115); // 1.15 * 100 is 114.99999999999999 in floats
  });

  it('refuses anything that is not a plain amount', () => {
    for (const bad of ['', ' ', 'abc', '55o', '-5', '+5', '1e3', '5.5.0', '550.123', '0x10', '550,5', 'NaN', 'Infinity']) {
      expect(parseAmountToMinor(bad)).toBeNull();
    }
    for (const bad of [null, undefined, true, {}, [550], NaN, Infinity, -5, 5.3000001]) {
      expect(parseAmountToMinor(bad)).toBeNull();
    }
  });
});

describe('amountError', () => {
  it('enforces the $5 minimum and $10,000 maximum', () => {
    expect(CUSTOM_MIN_MINOR).toBe(500);
    expect(amountError(null)).toMatch(/number/);
    expect(amountError(100)).toMatch(/minimum/i);
    expect(amountError(499)).toMatch(/minimum/i);
    expect(amountError(500)).toBeNull();
    expect(amountError(CUSTOM_MAX_MINOR)).toBeNull();
    expect(amountError(CUSTOM_MAX_MINOR + 1)).toMatch(/maximum/i);
  });
});

describe('transaction ids', () => {
  it('are prefixed so a callback can never be taken for a course purchase', () => {
    const id = newCustomTxnId();
    expect(id).toMatch(/^MPAY[0-9A-F]{20}$/);
    expect(isCustomTxnId(id)).toBe(true);
    // Course ids are "MITS" + hex, and hex has no letter after F, so "MPAY" cannot collide.
    expect(isCustomTxnId('MITSC0FFEE0123456789ABCD')).toBe(false);
    expect(isCustomTxnId(null)).toBe(false);
  });
});
