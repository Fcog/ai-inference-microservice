import { ClaudeStrategy } from './claude-strategy';
import { InferenceResult, InferenceStrategy, UnknownProviderError } from './inference-strategy';
import { MockStrategy } from './mock-strategy';
import { OpenAIStrategy } from './openai-strategy';
import { ResponseCache } from './response-cache';

export { UnknownProviderError };

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';
const DEFAULT_CLAUDE_MAX_TOKENS = 1024;

/**
 * Holds the active provider and delegates inference to it.
 * Callers switch providers by name without knowing the concrete client.
 */
export class InferenceContext {
  constructor(
    private readonly strategies: ReadonlyMap<string, InferenceStrategy>,
    private readonly aliases: ReadonlyMap<string, string>,
    private readonly defaultProvider: string,
    private readonly cache?: ResponseCache,
  ) {}

  availableProviders(): string[] {
    return [...this.strategies.keys()];
  }

  async complete(prompt: string, provider?: string): Promise<InferenceResult> {
    const strategy = this.select(provider);
    const cached = await this.readCache(strategy.name, strategy.model, prompt);
    if (cached) {
      return cached;
    }

    const result = await strategy.complete(prompt);
    await this.writeCache(prompt, result);
    return result;
  }

  private select(provider?: string): InferenceStrategy {
    const requested = provider?.trim();
    const name = requested
      ? this.aliases.get(requested.toLowerCase()) ?? requested.toLowerCase()
      : this.defaultProvider;
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new UnknownProviderError(requested || name, this.availableProviders());
    }
    return strategy;
  }

  private async readCache(provider: string, model: string, prompt: string): Promise<InferenceResult | undefined> {
    if (!this.cache) {
      return undefined;
    }
    try {
      return await this.cache.get(provider, model, prompt);
    } catch (error) {
      console.error('Redis cache read failed:', error);
      return undefined;
    }
  }

  private async writeCache(prompt: string, result: InferenceResult): Promise<void> {
    if (!this.cache) {
      return;
    }
    try {
      await this.cache.set(prompt, result);
    } catch (error) {
      console.error('Redis cache write failed:', error);
    }
  }
}

export function createInferenceContext(
  env: NodeJS.ProcessEnv = process.env,
  cache?: ResponseCache,
): InferenceContext {
  const strategies = new Map<string, InferenceStrategy>([
    ['mock', new MockStrategy()],
    ['openai', new OpenAIStrategy(env.OPENAI_API_KEY, env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL)],
    [
      'claude',
      new ClaudeStrategy(
        env.ANTHROPIC_API_KEY,
        env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
        readPositiveInt(env.ANTHROPIC_MAX_TOKENS, DEFAULT_CLAUDE_MAX_TOKENS),
      ),
    ],
  ]);

  const aliases = new Map<string, string>([['anthropic', 'claude']]);
  const requestedDefault = (env.AI_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();
  const defaultProvider = aliases.get(requestedDefault) ?? requestedDefault;
  if (!strategies.has(defaultProvider)) {
    throw new Error(`AI_PROVIDER must be one of: ${[...strategies.keys()].join(', ')}`);
  }

  return new InferenceContext(strategies, aliases, defaultProvider, cache);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`ANTHROPIC_MAX_TOKENS must be a positive integer, received "${value}"`);
  }
  return parsed;
}
