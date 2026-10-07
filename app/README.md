# 📦 AI Inference Application Service

This directory contains the core application server logic. The application is built using **TypeScript** and **Node.js (Express)**, featuring a standard Kubernetes health monitor routing structure and an advanced **Redis caching interceptor** to drop LLM token expenditure and inference latency.

---

## 🧠 Core Engineering Logic

The application implements a standard gateway pattern for incoming AI requests:

```text
       [ POST /predict ]
               │
               ▼
   ┌───────────────────────┐
   │  Query Redis Cache    │
   └───────────┬───────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  [Cache Hit]     [Cache Miss]
   Instantly        Execute 500ms Mock LLM
   Return 0ms       & Write to Redis
```

- **Health Checks (`GET /health`):** Essential for Kubernetes liveness probes. If the app locks up, crashes, or loses critical database connections, this endpoint returns a non-200 code, signaling Kubernetes to instantly destroy and recreate the failing pod.
- **The Cache Layer (`POST /predict`):** Intercepts incoming prompts before hitting costly downstream API components.
  - **Cache Miss:** If the prompt is unique, the system acts as a standard proxy to process the tokens, saves the string inside Redis with a **1-hour expiration Time-To-Live (TTL)**, and returns the response.
  - **Cache Hit:** If an identical prompt is sent within the hour, the system pulls directly from the memory footprint of the cluster's Redis node, skipping downstream processing entirely.

---

## ⚡ The Local Development Loop

To streamline local debugging without pushing images to Docker Hub constantly, you can build your TypeScript service directly into your local Kubernetes cluster's execution engine.

### 1. Point Terminal to Minikube

```bash
# Instructs your computer's Docker CLI to talk directly to Minikube's Docker Engine
eval $(minikube docker-env)
```

### 2. Build the Service Locally

```bash
# Compiles your code directly into the cluster's local image registry
docker build -t ai-inference-service:local .
```

### 3. Deploy/Update Manifest

Ensure your Helm setup or raw deployment files are instructed to use this local image without searching external registries:

```yaml
spec:
  containers:
    - name: node-app
      image: ai-inference-service:local
      imagePullPolicy: Never # Forces K8s to look only inside the local daemon
```

---

## 🛰️ Validating the Caching Infrastructure

Once your service is running inside the cluster and your port-forward tunnel (`kubectl port-forward service/my-ai-app-service 8080:80`) is open, run these verification steps to test the cache mechanics.

### Request 1: Trigger a Cache Miss

```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is MLOps?"}'
```

- **Result:** You will notice a slight `500ms` processing delay. The returned JSON structure will include:
  ```json
  { "source": "mock-llm", "result": "..." }
  ```

### Request 2: Trigger a Cache Hit

Execute the exact same command immediately after:

```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is MLOps?"}'
```

- **Result:** The payload will return **instantly (0ms response time)**. The returned JSON structure confirms the cache intercept:
  ```json
  { "source": "cache", "result": "..." }
  ```

---

## 📝 Diagnostic Logs Execution

To visually witness the data flow logs handling cache transitions across your live cluster replicas:

```bash
# Stream the runtime application server logs
kubectl logs -l app=my-ai-app --tail=20 -f
```
