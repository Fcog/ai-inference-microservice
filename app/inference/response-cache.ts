import { createHash } from 'node:crypto';
import { createClient, RedisClientType } from 'redis';
import { InferenceResult } from './inference-strategy';

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const DEFAULT_TTL_SECONDS = 3600;

/** Stores predict completions in Redis and returns them on a later identical request. */
export class ResponseCache {
  private readonly client: RedisClientType;
  private readonly ttlSeconds: number;

  constructor(url: string, ttlSeconds: number) {
    this.client = createClient({ url });
    this.ttlSeconds = ttlSeconds;
    this.client.on('error', (error) => {
      console.error('Redis client error:', error);
    });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ResponseCache {
    return new ResponseCache(env.REDIS_URL?.trim() || DEFAULT_REDIS_URL, readTtlSeconds(env.REDIS_CACHE_TTL_SECONDS));
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async get(provider: string, model: string, prompt: string): Promise<InferenceResult | undefined> {
    if (!this.client.isReady) {
      return undefined;
    }
    const raw = await this.client.get(cacheKey(provider, model, prompt));
    if (!raw) {
      return undefined;
    }
    return parseResult(raw);
  }

  async set(prompt: string, result: InferenceResult): Promise<void> {
    if (!this.client.isReady) {
      return;
    }
    await this.client.set(cacheKey(result.provider, result.model, prompt), JSON.stringify(result), {
      expiration: { type: 'EX', value: this.ttlSeconds },
    });
  }
}

function cacheKey(provider: string, model: string, prompt: string): string {
  const digest = createHash('sha256').update(`${provider}\0${model}\0${prompt}`).digest('hex');
  return `predict:${digest}`;
}

function parseResult(raw: string): InferenceResult | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'result' in parsed &&
      'provider' in parsed &&
      'model' in parsed &&
      typeof parsed.result === 'string' &&
      typeof parsed.provider === 'string' &&
      typeof parsed.model === 'string'
    ) {
      return { result: parsed.result, provider: parsed.provider, model: parsed.model, source: 'cache' };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readTtlSeconds(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TTL_SECONDS;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`REDIS_CACHE_TTL_SECONDS must be a positive integer, received "${value}"`);
  }
  return parsed;
}
