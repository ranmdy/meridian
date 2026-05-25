/**
 * Monitoring & Alerting Service
 *
 * Provides a thin, pluggable error tracking layer.
 *
 * Production integrations (one or both):
 *   - Sentry: set SENTRY_DSN in env
 *   - Slack:  set SLACK_WEBHOOK_URL in env (critical alerts only)
 *
 * In development (neither env var set) all calls are no-ops.
 *
 * Usage:
 *   import { monitoring } from './services/monitoring/index.js'
 *
 *   monitoring.captureError(new Error('bridge failed'), { chainId: 1, strategyId });
 *   monitoring.alert('Relayer balance low', { chain: 'ETH', balanceEth: 0.03 });
 *   monitoring.info('Strategy completed', { strategyId, finalAmount: '100.00' });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'fatal' | 'error' | 'warning' | 'info';

export interface MonitoringContext {
  [key: string]: unknown;
}

// ─── Sentry ───────────────────────────────────────────────────────────────────

type SentryModule = {
  init: (opts: { dsn: string; environment: string; tracesSampleRate: number }) => void;
  captureException: (err: unknown, ctx?: { extra?: MonitoringContext }) => void;
  captureMessage: (msg: string, level?: Severity) => void;
  setContext: (name: string, ctx: MonitoringContext) => void;
};

let _sentry: SentryModule | null = null;

async function getSentry(): Promise<SentryModule | null> {
  if (_sentry) return _sentry;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dependency; not installed in dev
    const mod = await import('@sentry/node') as unknown as SentryModule;
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
    });
    _sentry = mod;
    return mod;
  } catch {
    console.warn('[Monitoring] @sentry/node not installed — Sentry disabled. Run: pnpm add @sentry/node');
    return null;
  }
}

// ─── Slack ────────────────────────────────────────────────────────────────────

async function postToSlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    // Never let the alerting system itself crash the service
    console.error('[Monitoring] Slack webhook failed:', err);
  }
}

// ─── Monitoring Service ───────────────────────────────────────────────────────

class MonitoringService {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = !!(process.env.SENTRY_DSN || process.env.SLACK_WEBHOOK_URL);
    if (process.env.NODE_ENV !== 'test') {
      if (this.enabled) {
        console.log('[Monitoring] Error tracking enabled');
      } else {
        console.log('[Monitoring] No SENTRY_DSN or SLACK_WEBHOOK_URL — running in no-op mode');
      }
    }
  }

  /**
   * Capture an exception (error). Always goes to Sentry if configured.
   * Also posts to Slack for fatal/error severity.
   */
  async captureError(
    err: unknown,
    context?: MonitoringContext,
    severity: Severity = 'error',
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);

    // Console always (structured for easy log aggregation)
    console.error(`[Monitoring] ${severity.toUpperCase()}: ${message}`, context ?? '');

    // Sentry
    const sentry = await getSentry();
    if (sentry) {
      if (context) sentry.setContext('extra', context);
      sentry.captureException(err, { extra: context });
    }

    // Slack — only for fatal/error severity
    if (severity === 'fatal' || severity === 'error') {
      const chain = context?.['chainId'] ? ` chain=${context['chainId']}` : '';
      const strategy = context?.['strategyId'] ? ` strategy=${String(context['strategyId']).slice(0, 10)}…` : '';
      await postToSlack(`🚨 *${severity.toUpperCase()}*${chain}${strategy}\n\`${message}\``);
    }
  }

  /**
   * Post a plain-language alert to Slack (and Sentry as a message).
   * Use for operational warnings (low balance, high latency, etc.).
   */
  async alert(title: string, context?: MonitoringContext): Promise<void> {
    const ctxStr = context ? JSON.stringify(context) : '';
    console.warn(`[Monitoring] ALERT: ${title}`, ctxStr);

    const sentry = await getSentry();
    if (sentry) sentry.captureMessage(title, 'warning');

    const details = context
      ? '\n' + Object.entries(context).map(([k, v]) => `• ${k}: \`${String(v)}\``).join('\n')
      : '';
    await postToSlack(`⚠️ *${title}*${details}`);
  }

  /**
   * Informational event — Sentry breadcrumb / log only, no Slack.
   */
  async info(message: string, context?: MonitoringContext): Promise<void> {
    console.info(`[Monitoring] INFO: ${message}`, context ?? '');

    const sentry = await getSentry();
    if (sentry) sentry.captureMessage(message, 'info');
  }

  /**
   * Wrap an async function call with error capture.
   * Returns the result or null on failure.
   */
  async wrap<T>(
    fn: () => Promise<T>,
    context?: MonitoringContext,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      await this.captureError(err, context);
      return null;
    }
  }
}

export const monitoring = new MonitoringService();
