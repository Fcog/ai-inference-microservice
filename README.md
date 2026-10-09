# AI Inference Microservice

A small HTTP service that turns a text prompt into a model completion. Callers send a prompt to a single endpoint and can choose which provider handles it. The service hides each provider behind one interface, so OpenAI, Claude, and a local mock all look the same to the API.

## Layout

| Path | What it is |
| --- | --- |
| `services/ai-inference/app/` | This service: TypeScript, Dockerfile, and local `.env` |
| `services/ai-inference/chart/` | Helm chart for this service |
| `infrastructure/` | Vault, External Secrets, and Argo CD. Shared by every service |

A new microservice is another directory under `services/`, with its own `app/` and `chart/`, plus its own workflow and Argo CD Application. `infrastructure/` stays shared.

## What it does

`POST /predict` accepts a prompt and an optional provider name. An inference context picks the matching strategy and returns the completion, the provider name, the model id, and where the answer came from.

Providers:

- **openai** — chat completion through the OpenAI API (`gpt-4o-mini` by default)
- **claude** — message completion through the Anthropic API (`claude-sonnet-5` by default). `anthropic` is accepted as an alias
- **mock** — a canned response that echoes the prompt, with no API key and no network call

`source` is `model` when a provider produced the completion, and `cache` when Redis already had that provider, model, and prompt.

`GET /health` returns `{ "status": "healthy" }` when the Node process can answer HTTP. Kubernetes uses it as the liveness probe. A down Redis cache does not fail this check.

## Technologies

- **Node.js 20** and **TypeScript** — the service is written in TypeScript and compiled to CommonJS
- **Express** — HTTP server and JSON body parsing
- **OpenAI SDK** and **Anthropic SDK** — provider clients, created only when that strategy runs
- **Redis** — caches predict completions
- **tsx** — watches and runs TypeScript during local development
- **Docker** — multi-stage image on `node:20-alpine`: compile in a build stage, then ship production dependencies and `dist/` only
- **Helm** and **Kubernetes** — Deployment, LoadBalancer Service, CPU requests and limits, liveness probe
- **Vault** and **External Secrets** — runtime environment variables for the cluster

## Architecture

```text
[ User / cURL ]
        │
        ▼
┌──────────────────┐
│   K8s Service    │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐      cache hit / miss      ┌─────────┐
│  Node.js pod     │ ─────────────────────────► │  Redis  │
└─────────┬────────┘                             └─────────┘
          │ cache miss
          ▼
   [ LLM provider ]

Env vars come from a Kubernetes Secret synced from Vault.
```

1. A LoadBalancer Service sends traffic to the app pods on container port 3000.
2. Each pod checks Redis before calling a provider. The cache key is the provider, model, and prompt.
3. Pods read `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `REDIS_URL` from the Secret `ai-app-runtime-secrets`. External Secrets fills that Secret from Vault.

## Prerequisites

- Node.js 20 or newer, for local runs
- [Docker Desktop](https://docker.com) or [Rancher Desktop](https://rancherdesktop.io)
- [Minikube](https://minikube.sigs.k8s.io/)
- [kubectl](https://kubernetes.io)
- [Helm](https://helm.sh)

## Run locally

```bash
cd services/ai-inference/app
cp .env.example .env
npm install
npm run dev
```

The server listens on port 3000, or on `PORT` when that variable is set. `REDIS_URL` defaults to `redis://127.0.0.1:6379`. If Redis is down, predict still runs and responses are not cached.

```bash
curl -s http://localhost:3000/predict \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello","provider":"mock"}'
```

```json
{
  "result": "Mock response for: Hello",
  "provider": "mock",
  "model": "mock",
  "source": "model"
}
```

Set `AI_PROVIDER` to `mock`, `openai`, or `claude` to choose the default when a request omits `provider`. OpenAI and Claude need their API keys in `services/ai-inference/app/.env`.

`npm run build` compiles to `services/ai-inference/app/dist/`, `npm start` runs the compiled app, and `npm run typecheck` checks types without emitting files.

## Deploy to Minikube

Install Vault, the External Secrets Operator, and Redis before the app release. See [infrastructure/README.md](infrastructure/README.md). Chart values and release commands are in [services/ai-inference/chart/README.md](services/ai-inference/chart/README.md).

Build and push from the repository root. The image context is `services/ai-inference/app/`:

```bash
docker build -t fcog/ai-inference:v1 ./services/ai-inference/app
docker push fcog/ai-inference:v1
```

Install or upgrade the dev release:

```bash
helm upgrade --install my-ai-app-dev ./services/ai-inference/chart -f ./services/ai-inference/chart/values-dev.yaml
```

The chart names the Service `<release>-service-loadbalancer` and the Deployment `<release>-deployment`. For this release that is `my-ai-app-dev-service-loadbalancer` and `my-ai-app-dev-deployment`.

```bash
kubectl port-forward service/my-ai-app-dev-service-loadbalancer 8080:80
```

```bash
curl -s -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain Kubernetes to a backend engineer in one sentence."}'
```

Pushing a new image under the same tag does not change the Deployment spec. `values-dev.yaml` sets `pullPolicy: Always`, so a rollout creates a pod that pulls the tag again:

```bash
kubectl rollout restart deployment/my-ai-app-dev-deployment
kubectl rollout status deployment/my-ai-app-dev-deployment
```

Environment variables are read when the container starts. After Vault or the synced Secret changes, restart the Deployment so the new pod picks them up.
