import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Geofencing Middleware
 *
 * Blocks access from OFAC-sanctioned jurisdictions at the edge (Vercel/Cloudflare).
 * Reads country from:
 *   - `x-vercel-ip-country`  — set by Vercel Edge Network
 *   - `CF-IPCountry`         — set by Cloudflare (fallback / non-Vercel deployments)
 *
 * Sanctioned country codes sourced from OFAC Specially Designated Nationals
 * list and U.S. Department of Commerce Entity List (BIS).
 *
 * Note: This is a best-effort frontend gate. All compliance-critical checks
 * must also be enforced server-side (backend API) and on-chain.
 */

// Two-letter ISO 3166-1 alpha-2 country codes for OFAC-sanctioned jurisdictions.
// Sources: OFAC country list + OFAC SDN cross-reference (updated 2025-Q2)
const BLOCKED_COUNTRIES = new Set([
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea (DPRK)
  'RU', // Russia
  'SY', // Syria
  'BY', // Belarus
  'MM', // Myanmar (Burma)
  'SD', // Sudan
  'SS', // South Sudan
  'VE', // Venezuela
  'YE', // Yemen
  'ZW', // Zimbabwe
  'CD', // Democratic Republic of Congo
  'LY', // Libya
  'SO', // Somalia
  'CF', // Central African Republic
  'HT', // Haiti (partial — designated actors)
  'NI', // Nicaragua
  'ML', // Mali
  'GN', // Guinea
]);

// Paths that bypass the geofence (health checks, static assets, etc.)
const BYPASS_PATHS = ['/api/health', '/_next/', '/favicon.ico', '/blocked'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow bypass paths through unconditionally
  if (BYPASS_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Detect country from CDN headers
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('CF-IPCountry') ??
    request.headers.get('x-country') ??
    null;

  if (country && BLOCKED_COUNTRIES.has(country.toUpperCase())) {
    // Redirect to a static blocked page rather than a hard error,
    // so users understand why access is restricted.
    const url = request.nextUrl.clone();
    url.pathname = '/blocked';
    url.search = '';
    return NextResponse.redirect(url, { status: 302 });
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
