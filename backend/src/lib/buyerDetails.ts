/**
 * Validation for the buyer details captured at checkout.
 *
 * The browser enforces these too, but this is the authority: the checkout
 * endpoint is reachable without the form, so anything the browser checks has
 * to be checked again here.
 */

import { z } from 'zod';

/** Dial codes the checkout offers, longest first so +353 wins over +35. */
const DIAL_CODES = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
  '46', '47', '48', '49', '51', '52', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64',
  '65', '66', '81', '82', '84', '86', '90', '91', '92', '94', '95', '98', '211', '212', '213',
  '216', '218', '220', '221', '233', '234', '249', '250', '251', '254', '255', '256', '260',
  '263', '264', '265', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370',
  '371', '372', '373', '380', '381', '385', '386', '420', '421', '423', '880', '886', '960',
  '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974',
  '975', '976', '977', '992', '993', '994', '995', '998',
].sort((a, b) => b.length - a.length);

/**
 * Splits a typed number into country code and national number, ignoring
 * spaces, dashes and brackets.
 *
 * A country code is only recognised behind an explicit "+". Without one every
 * digit is the national number — otherwise "98765432101" would silently parse
 * as +9 8765432101 and pass a length check it should fail.
 */
export function normalisePhone(raw: string): { countryCode: string | null; digits: string } {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+')) return { countryCode: null, digits };

  const dial = DIAL_CODES.find((d) => digits.startsWith(d) && digits.length > d.length);
  return dial
    ? { countryCode: dial, digits: digits.slice(dial.length) }
    : { countryCode: null, digits };
}

export function formatPhone(raw: string): string {
  const { countryCode, digits } = normalisePhone(raw);
  return countryCode ? `+${countryCode} ${digits}` : digits;
}

// National numbers are not 10 digits everywhere — UK mobiles are 10 but many
// UK landlines are shorter, UAE is 9, Ireland 9. A range keeps the obvious
// typos out without rejecting legitimate numbers from the countries we sell to.
const MIN_NATIONAL_DIGITS = 7;
const MAX_NATIONAL_DIGITS = 12;

const phoneField = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine((v) => /^\+?[\d\s()-]+$/.test(v), 'Phone number can only contain digits')
  .refine((v) => {
    const n = normalisePhone(v).digits.length;
    return n >= MIN_NATIONAL_DIGITS && n <= MAX_NATIONAL_DIGITS;
  }, `Phone number must be ${MIN_NATIONAL_DIGITS}–${MAX_NATIONAL_DIGITS} digits`)
  .refine((v) => {
    const cc = normalisePhone(v).countryCode;
    return cc === null || (cc.length >= 1 && cc.length <= 3);
  }, 'Country code must be 1–3 digits');

export const buyerDetailsSchema = z.object({
  buyerName: z.string().trim().min(2, 'Full name is required').max(120),
  buyerEmail: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  buyerPhone: phoneField,
});

export type BuyerDetails = z.infer<typeof buyerDetailsSchema>;
