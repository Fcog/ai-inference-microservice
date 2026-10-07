import { InferenceResult, InferenceStrategy } from './inference-strategy';

/** Returns a canned completion so callers can exercise the API without a provider key. */
export class MockStrategy implements InferenceStrategy {
  readonly name = 'mock';
  readonly model = 'mock';

  async complete(prompt: string): Promise<InferenceResult> {
    return {
      result: `Mock response for: ${prompt}`,
      provider: this.name,
      model: this.model,
      source: 'model',
    };
  }
}
