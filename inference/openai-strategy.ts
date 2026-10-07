import { OpenAI } from 'openai';
import { InferenceResult, InferenceStrategy } from './inference-strategy';

export class OpenAIStrategy implements InferenceStrategy {
  readonly name = 'openai';
  private client: OpenAI | undefined;

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string,
  ) {}

  async complete(prompt: string): Promise<InferenceResult> {
    const completion = await this.getClient().chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = completion.choices[0]?.message?.content;
    if (result == null) {
      throw new Error('OpenAI returned an empty completion');
    }

    return { result, provider: this.name, model: this.model, source: 'model' };
  }

  private getClient(): OpenAI {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.client ??= new OpenAI({ apiKey: this.apiKey });
    return this.client;
  }
}
