export interface InferenceResult {
  result: string;
  provider: string;
  model: string;
}

/** Common contract every AI provider implements. */
export interface InferenceStrategy {
  readonly name: string;
  readonly model: string;
  complete(prompt: string): Promise<InferenceResult>;
}

export class UnknownProviderError extends Error {
  readonly available: readonly string[];

  constructor(provider: string, available: readonly string[]) {
    super(`Unknown provider "${provider}". Expected one of: ${available.join(', ')}`);
    this.name = 'UnknownProviderError';
    this.available = available;
  }
}
