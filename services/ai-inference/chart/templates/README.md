# 🌐 NGINX Ingress Routing Infrastructure

This guide documents how traffic enters the cluster and routes cleanly down to the strategy-patterned inference microservice. By transitioning from an exposed public `LoadBalancer` to a private **`ClusterIP`** combined with an **NGINX Ingress Controller**, we achieve production-grade traffic management, centralized routing, and architectural cost optimization.

---

## 🗺️ Path Routing Architecture

When an external network request hits the cluster, the NGINX Ingress controller acts as a reverse proxy, inspecting the subpath before handing the request off:

```text
       External Request: http://my-local-ai-service.com/api/predict
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │  NGINX Ingress Controller │ (Listens on Cluster Port 80)
                        └─────────────┬─────────────┘
                                      │
                                      │ 1. Matches Path: /api/?(.*)
                                      │ 2. Strips '/api' prefix via Regex
                                      ▼
                        ┌───────────────────────────┐
                        │ Private ClusterIP Service │ (Hidden internally)
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    TypeScript app.ts      │ (Receives POST /predict)
                        └─────────────┬─────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
     [ openai-strategy.ts ]  [ claude-strategy.ts ]  [ mock-strategy.ts ]
```

1. **Gatekeeping:** External clients send traffic to a unified local test domain (`my-local-ai-service.com`).
2. **Regex Rewrite:** The Ingress controller matches `/api/predict`, strips the `/api` prefix with the rewrite capture, and forwards `POST /predict` to the ClusterIP Service.
3. **Internal Decoupling:** `app.ts` stays on its own routes. `POST /predict` checks the cache in `response-cache.ts` and delegates to the selected strategy (`openai-strategy.ts`, `claude-strategy.ts`, or `mock-strategy.ts`).

---

## 🚀 Local Setup & Activation Steps

Follow these steps to deploy and test the network interface locally inside Minikube.

### 1. Enable the Local NGINX Ingress Engine

Minikube includes an enterprise-grade NGINX reverse-proxy engine as a built-in addon:

```bash
minikube addons enable ingress
```

_Note: It takes roughly 30–60 seconds for the controller to initialize. You can track its status using:_ `kubectl get pods -n ingress-nginx`

### 2. Upgrade the Helm Deployment Stack

From the repository root, install or upgrade the release. The chart has no default `values.yaml`, so pass the dev profile. The Service template is already `ClusterIP`, and this also applies `ingress.yaml`:

```bash
helm upgrade --install my-ai-app-dev ./services/ai-inference/chart -f ./services/ai-inference/chart/values-dev.yaml
```

### 3. Register the Local Domain Mapping

Map the test domain in `/etc/hosts` (`sudo nano /etc/hosts`).

On macOS with the Docker driver, the ingress addon is published on localhost. Add:

```text
127.0.0.1   my-local-ai-service.com
```

In another terminal, start the tunnel and leave it running. It binds ports 80 and 443 and will ask for your password:

```bash
minikube tunnel
```

On Linux, point the same name at the address from `minikube ip`.

---

## 🛰️ Verification & Integration Testing

With the hosts entry in place, and `minikube tunnel` running on macOS, the controller accepts the request on port 80.

Fire a payload request against the target subpath entry point:

```bash
curl -X POST http://my-local-ai-service.com/api/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Execute strategy layer routing checks."}'
```

### 🔍 Inspecting the Pipeline Runtime Logs

To visually verify that your Ingress controller is successfully passing data to your application strategy blocks, stream your container logs:

```bash
# Pods are labeled app=<release>-app
kubectl logs -l app=my-ai-app-dev-app --tail=15 -f
```

_A successful response includes `provider` and `source` (`model` or `cache`). Container logs show the startup line and any inference or Redis errors._
