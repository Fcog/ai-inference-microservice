# AI Inference Application Service

This directory is the Node.js service. It contains the TypeScript source, the Dockerfile, and the local environment file.

| Path | Role |
| --- | --- |
| `app.ts` | Express app: `GET /health` and `POST /predict` |
| `inference/` | Provider strategies, the inference context, and the Redis cache adapter |
| `Dockerfile` | Multi-stage image: compile TypeScript, then run `node dist/app.js` |
| `.env.example` | Variables for a local `npm run dev` process |

## Request flow

`POST /predict` resolves the provider, then asks Redis for a stored completion. A hit returns that completion with `source` set to `cache`. A miss calls the provider, stores the result, and returns it with `source` set to `model`.

The cache key is the provider name, the model id, and the prompt. `claude` and `anthropic` share one entry because `anthropic` is an alias. Entries expire after `REDIS_CACHE_TTL_SECONDS` (one hour by default).

```json
{
  "result": "Mock response for: Hello",
  "provider": "mock",
  "model": "mock",
  "source": "cache"
}
```

`GET /health` returns `{ "status": "healthy" }` when the process is up. It does not check Redis. The Helm chart uses this path as the liveness probe, so a cache outage must not restart the pod.

If Redis is unreachable, predict still calls the provider and skips the cache.

## Run locally

From this directory:

```bash
cp .env.example .env
npm install
npm run dev
```

The process listens on port 3000. Point `REDIS_URL` at a Redis server, or leave the default `redis://127.0.0.1:6379`.

```bash
curl -s http://localhost:3000/predict \
  -H 'content-type: application/json' \
  -d '{"prompt": "What is Helm?", "provider": "mock"}'
```

Send the same body again. The second response has `"source": "cache"` when Redis stored the first one.

`npm run build` writes `dist/`. `npm start` runs the compiled server. `npm run typecheck` checks types without emitting files.

## Image

Build from the repository root so the context is this directory:

```bash
docker build -t fcog/ai-inference:v1 ./services/ai-inference/app
docker push fcog/ai-inference:v1
```

From inside this directory, the same build is `docker build -t fcog/ai-inference:v1 .`.

To build straight into Minikube's Docker engine instead of pushing to a registry:

```bash
eval $(minikube docker-env)
docker build -t fcog/ai-inference:v1 .
```

Set `image.pullPolicy` to `Never` or `IfNotPresent` in the Helm values when the image exists only inside Minikube. `Always` asks Docker Hub on every new pod.

## Call the service in the cluster

The Service name is the Helm release name plus `-service-loadbalancer`. For the dev release:

```bash
kubectl port-forward service/my-ai-app-dev-service-loadbalancer 8080:80
```

```bash
curl -s -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Helm?"}'
```

Logs for that release:

```bash
kubectl logs -l app=my-ai-app-dev-app --tail=20 -f
```

The pod label is `<release>-app`, which matches the Deployment selector in the chart.
