import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  generateNonce,
  verifySiweSignature,
  verifyJwt,
  type JwtPayload,
} from '../../services/auth/index.js';
import { getSubscription, type SubscriptionTier } from '../../services/stripe/index.js';

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

      // Also set an HttpOnly cookie for browser clients
      reply.header(
        'Set-Cookie',
        `meridian_token=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 3600}`,
      );

      return reply.send({
        token: result.token,
        wallet: result.wallet,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      return reply.status(403).send({
        error: 'Authentication failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // GET /auth/me — return current authenticated user
  fastify.get('/auth/me', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    return reply.send({ wallet: request.user!.sub, expiresAt: request.user!.exp });
  });

  // POST /auth/logout — clear the cookie
  fastify.post('/auth/logout', async (_request, reply) => {
    reply.header(
      'Set-Cookie',
      'meridian_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    );
    return reply.send({ ok: true });
  });
}
