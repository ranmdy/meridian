import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  generateNonce,
  verifySiweSignature,
  verifyJwt,
  verifyRefreshToken,
  issueJwt,
  revokeRefreshToken,
  issueRefreshToken,
  type JwtPayload,
} from '../../services/auth/index.js';
import { getSubscription, type SubscriptionTier } from '../../services/stripe/index.js';
import { getUserEmail, updateUserEmail } from '../../db/execution-store.js';

const VerifySchema = z.object({
  nonce: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

// Augment FastifyRequest with the authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Extract JWT from request: Authorization header (Bearer) or cookie.
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookie = request.headers['cookie'];
  if (cookie) {
    const match = /meridian_token=([^;]+)/.exec(cookie);
    if (match) return match[1];
  }
  return null;
}

/**
 * Middleware: authenticate request and attach `request.user`.
 * Returns 401 if the token is missing or invalid.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request);
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  try {
    request.user = verifyJwt(token);
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

/**
 * Factory: returns a middleware that requires the authenticated user to be on
 * the given tier (or higher). Tier order: free < pro < api.
 *
 * Usage:
 *   fastify.get('/premium', { preHandler: [requireAuth, requireTier('pro')] }, ...)
 */
export function requireTier(minTier: SubscriptionTier) {
  const tierRank: Record<SubscriptionTier, number> = { free: 0, pro: 1, api: 2 };

  return async function tierGate(request: FastifyRequest, reply: FastifyReply) {
    const wallet = request.user?.sub;
    if (!wallet) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const sub = getSubscription(wallet);
    const currentTier: SubscriptionTier = sub?.tier ?? 'free';
    const currentStatus = sub?.status ?? 'active';

    if (
      tierRank[currentTier] < tierRank[minTier] ||
      (currentStatus !== 'active' && currentStatus !== 'trialing')
    ) {
      return reply.status(403).send({
        error: 'Subscription required',
        message: `This endpoint requires a ${minTier} subscription or higher.`,
        requiredTier: minTier,
        currentTier,
        upgradeUrl: '/billing',
      });
    }
  };
}

export async function authRoutes(fastify: FastifyInstance) {
  // GET /auth/nonce — generate a sign-in nonce
  fastify.get<{
    Querystring: { wallet?: string };
  }>('/auth/nonce', async (request, reply) => {
    const { wallet } = request.query;
    const result = generateNonce(wallet);
    return reply.send(result);
  });

  // POST /auth/verify — verify signature and issue JWT
  fastify.post('/auth/verify', async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { nonce, signature, wallet } = parsed.data;
    try {
      const result = await verifySiweSignature(nonce, signature, wallet);

      // Set HttpOnly cookies for browser clients
      reply.header('Set-Cookie', [
        `meridian_token=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 3600}`,
        `meridian_refresh=${result.refreshToken}; Path=/auth/refresh; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}`,
      ].join(', '));

      return reply.send({
        token: result.token,
        wallet: result.wallet,
        expiresAt: result.expiresAt,
        refreshExpiresAt: result.refreshExpiresAt,
      });
    } catch (err) {
      return reply.status(403).send({
        error: 'Authentication failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // GET /auth/me — return current authenticated user (includes email if set)
  fastify.get('/auth/me', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const wallet = request.user!.sub;
    const email = await getUserEmail(wallet);
    return reply.send({ wallet, expiresAt: request.user!.exp, email: email ?? null });
  });

  // PATCH /auth/me — update (or clear) the authenticated user's email
  fastify.patch('/auth/me', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const parsed = z.object({
      email: z.string().email().nullable(),
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const wallet = request.user!.sub;
    const ok = await updateUserEmail(wallet, parsed.data.email);

    // If DB not configured, still acknowledge the request (no-op in dev without DB)
    return reply.send({ wallet, email: parsed.data.email, persisted: ok });
  });

  // POST /auth/refresh — exchange a valid refresh token for a new access + refresh token pair
  fastify.post('/auth/refresh', async (request, reply) => {
    // Accept refresh token from cookie or JSON body
    const cookie = (request.headers['cookie'] as string | undefined) ?? '';
    const cookieMatch = /meridian_refresh=([^;]+)/.exec(cookie);
    const bodyToken = (request.body as { refreshToken?: string } | undefined)?.refreshToken;
    const refreshToken = cookieMatch?.[1] ?? bodyToken;

    if (!refreshToken) {
      return reply.status(401).send({ error: 'Refresh token required' });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      // Rotate: revoke old refresh token, issue new pair
      revokeRefreshToken(refreshToken);
      const newAccess = issueJwt(payload.sub);
      const newRefresh = issueRefreshToken(payload.sub);
      const now = Math.floor(Date.now() / 1000);

      reply.header('Set-Cookie', [
        `meridian_token=${newAccess}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 3600}`,
        `meridian_refresh=${newRefresh}; Path=/auth/refresh; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}`,
      ].join(', '));

      return reply.send({
        token: newAccess,
        wallet: payload.sub,
        expiresAt: now + 24 * 3600,
        refreshExpiresAt: now + 30 * 24 * 3600,
      });
    } catch (err) {
      return reply.status(401).send({
        error: 'Invalid or expired refresh token',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // POST /auth/logout — clear both cookies and revoke refresh token
  fastify.post('/auth/logout', async (request, reply) => {
    // Revoke refresh token if present so it can't be reused
    const cookie = (request.headers['cookie'] as string | undefined) ?? '';
    const cookieMatch = /meridian_refresh=([^;]+)/.exec(cookie);
    if (cookieMatch?.[1]) revokeRefreshToken(cookieMatch[1]);

    reply.header('Set-Cookie', [
      'meridian_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      'meridian_refresh=; Path=/auth/refresh; HttpOnly; SameSite=Strict; Max-Age=0',
    ].join(', '));
    return reply.send({ ok: true });
  });
}
