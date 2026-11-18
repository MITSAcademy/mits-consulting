/**
 * Checkout price guards.
 *
 * On 8 Oct course 1086 was set to $1 in the Hub to test PayGlocal live and was
 * never reset; a real buyer was charged $1 for a course the website showed at
 * $450. These tests fail the build if a test price is committed again.
 *
 *   Run:  npx jest checkoutPrices
 */

import { findCourse, isTestPrice, testPricedCourses, MIN_CHARGE_MINOR } from '../lib/courseCatalog';
import { billingCountryForDial, normalisePhone } from '../lib/buyerDetails';

describe('course catalog prices', () => {
  it('has no course priced below the checkout floor', () => {
    expect(testPricedCourses().map((c) => `${c.id} ${c.title}: ${c.amount}`)).toEqual([]);
  });

  it('charges the advertised $450 for AI Ethics & Responsible AI', () => {
    expect(findCourse(1086)?.amount).toBe(45000);
  });

  it('treats anything under $5 as a test price', () => {
    expect(isTestPrice({ id: 1, title: 't', amount: 100, currency: 'USD' })).toBe(true);
    expect(isTestPrice({ id: 1, title: 't', amount: MIN_CHARGE_MINOR, currency: 'USD' })).toBe(false);
  });
});

describe('billing country', () => {
  it('maps the buyer dial code instead of always sending India', () => {
    expect(billingCountryForDial(normalisePhone('+1 4165550123').countryCode)).toBe('US');
    expect(billingCountryForDial(normalisePhone('+91 9876543210').countryCode)).toBe('IN');
    expect(billingCountryForDial(normalisePhone('+44 7700900123').countryCode)).toBe('GB');
    expect(billingCountryForDial(null)).toBeNull();
  });
});
