import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { createApp } from './app';
import { InferenceContext } from './inference/inference-context';
import { InferenceResult, UnknownProviderError } from './inference/inference-strategy';

const completion: InferenceResult = {
  result: 'Mock response for: Hello',
  provider: 'mock',
  model: 'mock',
  source: 'model',
};

describe('POST /predict', () => {
  it('returns the completion for a prompt and provider', async () => {
    const seen: { prompt?: string; provider?: string } = {};
    const { status, body } = await postPredict(
      inferenceWith(async (prompt, provider) => {
        seen.prompt = prompt;
        seen.provider = provider;
        return completion;
      }),
      { prompt: 'Hello', provider: 'mock' },
    );

    assert.equal(status, 200);
    assert.deepEqual(body, completion);
    assert.deepEqual(seen, { prompt: 'Hello', provider: 'mock' });
  });

  it('rejects a missing or blank prompt', async () => {
    for (const payload of [{}, { prompt: '   ' }, { prompt: '' }]) {
      let called = false;
      const { status, body } = await postPredict(
        inferenceWith(async () => {
          called = true;
          return completion;
        }),
        payload,
      );

      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'Field `prompt` must be a non-empty string' });
      assert.equal(called, false);
    }
  });

  it('rejects a non-string provider', async () => {
    const { status, body } = await postPredict(inferenceWith(async () => completion), {
      prompt: 'Hello',
      provider: 1,
    });

    assert.equal(status, 400);
    assert.deepEqual(body, { error: 'Field `provider` must be a string' });
  });

  it('returns the unknown-provider error', async () => {
    const { status, body } = await postPredict(
      inferenceWith(async () => {
        throw new UnknownProviderError('nope', ['mock', 'openai', 'claude']);
      }),
      { prompt: 'Hello', provider: 'nope' },
    );

    assert.equal(status, 400);
    assert.deepEqual(body, {
      error: 'Unknown provider "nope". Expected one of: mock, openai, claude',
    });
  });

  it('returns 500 when inference fails', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const { status, body } = await postPredict(
        inferenceWith(async () => {
          throw new Error('provider down');
        }),
        { prompt: 'Hello' },
      );

      assert.equal(status, 500);
      assert.deepEqual(body, { error: 'Inference failed' });
    } finally {
      console.error = original;
    }
  });
});

function inferenceWith(
  complete: (prompt: string, provider?: string) => Promise<InferenceResult>,
): InferenceContext {
  return { complete } as InferenceContext;
}

function postPredict(
  inference: InferenceContext,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const body = JSON.stringify(payload);
  const server = createApp(inference).listen(0);

  return new Promise((resolve, reject) => {
    const { port } = server.address() as AddressInfo;
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/predict',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          server.close();
          resolve({
            status: response.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : undefined,
          });
        });
      },
    );
    request.on('error', (error) => {
      server.close();
      reject(error);
    });
    request.end(body);
  });
}
