/**
 * Meridian SDK — HTTP Client
 *
 * Thin fetch wrapper with:
 *  - Automatic Authorization header injection
 *  - Timeout via AbortController
 *  - Structured error messages from the API
 */

import type { MeridianConfig } from './types.js';

const DEFAULT_API_URL = 'https://api.meridian.finance';
const DEFAULT_TIMEOUT = 30_000;

export class MeridianApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`MeridianApiError [${status}]: ${message}`);
    this.name = 'MeridianApiError';
  }
}

export class MeridianClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: MeridianConfig = {}) {
    this.baseUrl  = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
    this.apiKey   = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Meridian request timed out after ${this.timeoutMs}ms: ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    if (!response.ok) {
      const message =
        typeof json === 'object' && json !== null && 'error' in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new MeridianApiError(message, response.status, json);
    }

    return json as T;
  }
}
