import Anthropic from '@anthropic-ai/sdk';
import { InferenceResult, InferenceStrategy } from './inference-strategy';

export class ClaudeStrategy implements InferenceStrategy {
  readonly name = 'claude';
  private client: Anthropic | undefined;

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly maxTokens: number,
  ) {}

  async complete(prompt: string): Promise<InferenceResult> {
    const message = await this.getClient().messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return { result, provider: this.name, model: this.model };
  }

  private getClient(): Anthropic {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    this.client ??= new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }
}
