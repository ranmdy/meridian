/**
 * Auth Service — Wallet-based SIWE (Sign-In With Ethereum) sessions
 *
 * Flow:
 *   1. Client calls GET /auth/nonce → receives { nonce, message, expiresAt }
 *   2. Client signs the message with their wallet
 *   3. Client calls POST /auth/verify → receives { token } (JWT, HttpOnly cookie)
 *   4. All subsequent API calls include the JWT in Authorization header or cookie
 *
 * JWT is HS256 using crypto.createHmac — no external dependencies.
 * Nonces are single-use and expire after 5 minutes.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { verifyMessage } from 'viem';

// ─── Config ───────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const ACCESS_TTL_SECONDS = 24 * 60 * 60;           // 24 hours
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;     // 30 days
const NONCE_TTL_MS = 5 * 60 * 1000;                // 5 minutes

/** @deprecated use ACCESS_TTL_SECONDS — kept for compatibility with existing callers */
const JWT_TTL_SECONDS = ACCESS_TTL_SECONDS;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}

// ─── Refresh token revocation store ───────────────────────────────────────────
// Maps refresh-token jti (random id embedded in payload) → expiry epoch.
// On logout or rotation, the old jti is added here and rejected until expiry.
const revokedRefreshJtis = new Map<string, number>();

// Purge expired revocations every 10 minutes
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revokedRefreshJtis) {
    if (exp < now) revokedRefreshJtis.delete(jti);
  }
}, 10 * 60_000).unref();

// ─── In-memory nonce store (Phase 2: move to Redis) ───────────────────────────

interface NonceEntry {
  nonce: string;
  wallet: string;  // empty until claimed
  expiresAt: number;
}

const nonceStore = new Map<string, NonceEntry>();

// Cleanup expired nonces every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of nonceStore) {
    if (entry.expiresAt < now) nonceStore.delete(key);
  }
}, 60_000);

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function b64url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function fromB64url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function sign(header: string, payload: string): string {
  const data = `${header}.${payload}`;
  return createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

export interface JwtPayload {
  sub: string;   // wallet address (lowercase)
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;   // wallet address (lowercase)
  jti: string;   // unique token id (for revocation)
  type: 'refresh';
  iat: number;
  exp: number;
}

export function issueJwt(wallet: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: wallet.toLowerCase(),
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  } satisfies JwtPayload));
  const sig = sign(header, payload);
  return `${header}.${payload}.${sig}`;
}

export function issueRefreshToken(wallet: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString('hex');
  const payload = b64url(JSON.stringify({
    sub: wallet.toLowerCase(),
    jti,
    type: 'refresh',
    iat: now,
    exp: now + REFRESH_TTL_SECONDS,
  } satisfies RefreshTokenPayload));
  const sig = sign(header, payload);
  return `${header}.${payload}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const [header, payload, sig] = parts;
  const expected = sign(header, payload);
  if (sig !== expected) throw new Error('Invalid JWT signature');
  const decoded = JSON.parse(fromB64url(payload)) as JwtPayload;
  if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired');
  return decoded;
}

/**
 * Verify a refresh token and return its payload.
 * Throws if invalid, expired, or revoked.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid refresh token format');
  const [header, payload, sig] = parts;
  const expected = sign(header, payload);
  if (sig !== expected) throw new Error('Invalid refresh token signature');
  const decoded = JSON.parse(fromB64url(payload)) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
  if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Refresh token expired');
  if (revokedRefreshJtis.has(decoded.jti)) throw new Error('Refresh token revoked');
  return decoded;
}

/**
 * Revoke a refresh token by its jti. Called on logout or token rotation.
 */
export function revokeRefreshToken(token: string): void {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return;
    const [, payload] = parts;
    const decoded = JSON.parse(fromB64url(payload)) as RefreshTokenPayload;
    if (decoded.jti && decoded.exp) {
      revokedRefreshJtis.set(decoded.jti, decoded.exp);
    }
  } catch {
    // Silently ignore malformed tokens on revoke
  }
}

// ─── Nonce management ─────────────────────────────────────────────────────────

export function generateNonce(wallet?: string): { nonce: string; message: string; expiresAt: number } {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL_MS;
  nonceStore.set(nonce, { nonce, wallet: wallet?.toLowerCase() ?? '', expiresAt });

  const message = buildSignMessage(nonce, expiresAt);
  return { nonce, message, expiresAt };
}

export function buildSignMessage(nonce: string, expiresAt: number): string {
  const expStr = new Date(expiresAt).toISOString();
  return `Sign in to Meridian\n\nNonce: ${nonce}\nExpires: ${expStr}\n\nBy signing this message you confirm you control this wallet. This request will not trigger a blockchain transaction or cost any gas.`;
}

// ─── Signature verification + session issue ───────────────────────────────────

export interface AuthResult {
  token: string;
  refreshToken: string;
  wallet: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export async function verifySiweSignature(
  nonce: string,
  signature: string,
  wallet: string,
): Promise<AuthResult> {
  const entry = nonceStore.get(nonce);
  if (!entry) throw new Error('Nonce not found or already used');
  if (entry.expiresAt < Date.now()) {
    nonceStore.delete(nonce);
    throw new Error('Nonce expired');
  }

  // Reconstruct message and verify signature
  const message = buildSignMessage(nonce, entry.expiresAt);
  const valid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!valid) throw new Error('Invalid signature');

  // Single-use: delete nonce
  nonceStore.delete(nonce);

  const token = issueJwt(wallet);
  const refreshToken = issueRefreshToken(wallet);
  const now = Math.floor(Date.now() / 1000);

  return {
    token,
    refreshToken,
    wallet: wallet.toLowerCase(),
    expiresAt: now + ACCESS_TTL_SECONDS,
    refreshExpiresAt: now + REFRESH_TTL_SECONDS,
  };
}
