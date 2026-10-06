# AI Inference Microservice

A small HTTP service that turns a text prompt into a model completion. Callers send a prompt to a single endpoint and can choose which provider handles it. The service hides each provider behind one interface, so OpenAI, Claude, and a local mock all look the same to the API.

## What it does

`POST /predict` accepts a prompt and an optional provider name. An inference context picks the matching strategy and returns the completion, the provider name, and the model id.

Providers:

- **openai** — chat completion through the OpenAI API (`gpt-4o-mini` by default)
- **claude** — message completion through the Anthropic API (`claude-sonnet-5` by default). `anthropic` is accepted as an alias
- **mock** — a canned response that echoes the prompt, with no API key and no network call

`GET /health` returns `{ "status": "healthy" }` for process and Kubernetes liveness checks.

## Technologies

- **Node.js 20** and **TypeScript** — the service is written in TypeScript and compiled to CommonJS
- **Express** — HTTP server and JSON body parsing
- **OpenAI SDK** and **Anthropic SDK** — provider clients, created only when that strategy runs
- **tsx** — watches and runs TypeScript during local development
- **Docker** — multi-stage image on `node:20-alpine`: compile in a build stage, then ship production dependencies and `dist/` only
- **Kubernetes** — a Deployment (two replicas, CPU requests and limits, liveness probe), a LoadBalancer Service, and a HorizontalPodAutoscaler that scales between 2 and 6 replicas on CPU

## Run locally

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

The server listens on port 3000, or on `PORT` when that variable is set.

```bash
curl -s http://localhost:3000/predict \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello","provider":"mock"}'
```

```json
{
  "result": "Mock response for: Hello",
  "provider": "mock",
  "model": "mock"
}
```

Set `AI_PROVIDER` to `mock`, `openai`, or `claude` to choose the default when a request omits `provider`. OpenAI and Claude need their API keys in `.env`. See `.env.example` for every variable.

Other scripts: `npm run build` compiles to `dist/`, `npm start` runs the compiled app, and `npm run typecheck` checks types without emitting files.
