import { describe, it, expect } from 'vitest';
import {
  generateNonce,
  buildSignMessage,
  issueJwt,
  verifyJwt,
} from '../src/services/auth/index.js';

describe('AuthService', () => {
  describe('generateNonce', () => {
    it('returns a nonce, message, and expiresAt', () => {
      const result = generateNonce();
      expect(typeof result.nonce).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(typeof result.expiresAt).toBe('number');
    });

    it('nonce is 32 hex characters (16 bytes)', () => {
      const { nonce } = generateNonce();
      expect(/^[0-9a-f]{32}$/.test(nonce)).toBe(true);
    });

    it('expiresAt is in the future', () => {
      const { expiresAt } = generateNonce();
      expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('two calls produce different nonces', () => {
      const a = generateNonce();
      const b = generateNonce();
      expect(a.nonce).not.toBe(b.nonce);
    });
  });

  describe('buildSignMessage', () => {
    it('includes the nonce', () => {
      const msg = buildSignMessage('abc123', Date.now() + 60_000);
      expect(msg).toContain('abc123');
    });

    it('mentions Meridian', () => {
      const msg = buildSignMessage('abc123', Date.now() + 60_000);
      expect(msg).toContain('Meridian');
    });

    it('is deterministic for the same inputs', () => {
      const ts = Date.now() + 60_000;
      expect(buildSignMessage('x', ts)).toBe(buildSignMessage('x', ts));
    });
  });

  describe('issueJwt / verifyJwt', () => {
    const wallet = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

    it('issues a token that passes verification', () => {
      const token = issueJwt(wallet);
      expect(() => verifyJwt(token)).not.toThrow();
    });

    it('token contains the wallet address (lowercased)', () => {
      const token = issueJwt(wallet);
      const payload = verifyJwt(token);
      expect(payload.sub).toBe(wallet.toLowerCase());
    });

    it('token has exp > iat', () => {
      const token = issueJwt(wallet);
      const payload = verifyJwt(token);
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('rejects a tampered token', () => {
      const token = issueJwt(wallet);
      const parts = token.split('.');
      // Tamper with the payload
      parts[1] = Buffer.from(JSON.stringify({ sub: '0xevil', iat: 0, exp: 9999999999 })).toString('base64url');
      expect(() => verifyJwt(parts.join('.'))).toThrow('Invalid JWT signature');
    });

    it('rejects a malformed token', () => {
      expect(() => verifyJwt('not.a.valid.jwt.token.here')).toThrow();
    });

    it('rejects a token with wrong number of parts', () => {
      expect(() => verifyJwt('only.two')).toThrow('Invalid JWT format');
    });
  });
});
