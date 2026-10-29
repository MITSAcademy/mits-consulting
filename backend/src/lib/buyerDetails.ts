/**
 * Validation for the buyer details captured at checkout.
 *
 * The browser enforces these too, but this is the authority: the checkout
 * endpoint is reachable without the form, so anything the browser checks has
 * to be checked again here.
 */

import { z } from 'zod';

/**
 * Splits a typed number into country code and national number, ignoring
 * spaces, dashes and brackets.
 *
 * A country code is only recognised behind an explicit "+". Without one, every
 * digit is the national number — otherwise "98765432101" would silently parse
 * as +9 8765432101 and pass a 10-digit check it should fail.
 */
export function normalisePhone(raw: string): { countryCode: string | null; digits: string } {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+') && digits.length > 10) {
    return { countryCode: digits.slice(0, digits.length - 10), digits: digits.slice(-10) };
  }
  return { countryCode: null, digits };
}

export function formatPhone(raw: string): string {
  const { countryCode, digits } = normalisePhone(raw);
  return countryCode ? `+${countryCode} ${digits}` : digits;
}

const phoneField = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine((v) => /^\+?[\d\s()-]+$/.test(v), 'Phone number can only contain digits')
  .refine((v) => normalisePhone(v).digits.length === 10, 'Phone number must be 10 digits')
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
