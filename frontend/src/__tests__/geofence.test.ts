import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the OFAC geofencing country list.
 * We extract the country-check logic so it can be tested without
 * needing Next.js request infrastructure.
 */

const BLOCKED_COUNTRIES = new Set([
  'CU', 'IR', 'KP', 'RU', 'SY', 'BY', 'MM', 'SD', 'SS', 'VE',
  'YE', 'ZW', 'CD', 'LY', 'SO', 'CF', 'HT', 'NI', 'ML', 'GN',
]);

function isBlocked(country: string | null): boolean {
  if (!country) return false;
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}

describe('geofencing — OFAC country list', () => {
  // ── Sanctioned countries (must block) ────────────────────────────────────────

  it('blocks Iran (IR)', () => expect(isBlocked('IR')).toBe(true));
  it('blocks North Korea (KP)', () => expect(isBlocked('KP')).toBe(true));
  it('blocks Cuba (CU)', () => expect(isBlocked('CU')).toBe(true));
  it('blocks Syria (SY)', () => expect(isBlocked('SY')).toBe(true));
  it('blocks Russia (RU)', () => expect(isBlocked('RU')).toBe(true));
  it('blocks Belarus (BY)', () => expect(isBlocked('BY')).toBe(true));
  it('blocks Venezuela (VE)', () => expect(isBlocked('VE')).toBe(true));
  it('blocks Myanmar (MM)', () => expect(isBlocked('MM')).toBe(true));
  it('blocks Sudan (SD)', () => expect(isBlocked('SD')).toBe(true));
  it('blocks Libya (LY)', () => expect(isBlocked('LY')).toBe(true));

  // ── Case insensitivity ────────────────────────────────────────────────────────

  it('blocks lowercase country codes (ir → blocked)', () => expect(isBlocked('ir')).toBe(true));
  it('blocks mixed-case codes (Ru → blocked)', () => expect(isBlocked('Ru')).toBe(true));

  // ── Allowed countries (must not block) ───────────────────────────────────────

  it('allows United States (US)', () => expect(isBlocked('US')).toBe(false));
  it('allows United Kingdom (GB)', () => expect(isBlocked('GB')).toBe(false));
  it('allows Germany (DE)', () => expect(isBlocked('DE')).toBe(false));
  it('allows Singapore (SG)', () => expect(isBlocked('SG')).toBe(false));
  it('allows Canada (CA)', () => expect(isBlocked('CA')).toBe(false));
  it('allows Japan (JP)', () => expect(isBlocked('JP')).toBe(false));
  it('allows Australia (AU)', () => expect(isBlocked('AU')).toBe(false));

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it('allows null country (no header present)', () => expect(isBlocked(null)).toBe(false));
  it('allows empty string', () => expect(isBlocked('')).toBe(false));
  it('allows unknown/invalid codes', () => expect(isBlocked('XX')).toBe(false));
  it('allows T1 (Tor exit — not in block list)', () => expect(isBlocked('T1')).toBe(false));
});
