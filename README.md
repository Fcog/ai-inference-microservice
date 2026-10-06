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

## Local Kubernetes AI Inference Service Setup

This repository contains a containerized TypeScript/Node.js AI inference microservice orchestrated locally using Kubernetes, featuring Liveness Health Probes, High Availability Load Balancing, and Horizontal Pod Autoscaling (HPA).

### 🚀 Prerequisites

Ensure you have the following installed on your machine:
• Docker Desktop or Rancher Desktop
• Minikube
• kubectl

### 🛠️ Step 1: Initialize the Local Cluster

Start Minikube and enable the Metrics Server addon. The Metrics Server is required to allow the Horizontal Pod Autoscaler (HPA) to read container CPU usage.

```bash
## Start the local Kubernetes cluster
minikube start

## Enable the metrics server (takes ~30-60 seconds to fully initialize)
minikube addons enable metrics-server

## Verify the cluster is up and nodes are responding
kubectl get nodes
```

### 📦 Step 2: Build and Tag the Container

Whenever you make changes to the TypeScript application code, you must rebuild the Docker image with an updated version tag before deploying it to the cluster.

```bash
## Build the Docker image (increment version tags v1, v2, etc., as needed)
docker build -t your-docker-username/ai-inference-service:v1 .

## (Optional) If using a remote registry:
# docker push your-docker-username/ai-inference-service:v1
```

Note: Ensure the image: string inside your deployment.yaml matches the exact tag you just built.

### 🚀 Step 3: Deploy to Kubernetes

Apply the declarative manifests to create the Deployment, LoadBalancer Service, and Horizontal Pod Autoscaler config.

```bash
# Apply the infrastructure deployment and service manifests
kubectl apply -f deployment.yaml

# Apply the Autoscaling (HPA) manifest
kubectl apply -f hpa.yaml
```

### 🌐 Step 4: Network Routing & Testing

Because Minikube runs inside a virtualized Docker environment, you must open a network tunnel to route local host traffic into the cluster.

#### Option A: Port Forward Tunnel (Quick & Easy)

Keep this command running in a dedicated terminal window:

```bash
kubectl port-forward service/ai-service-loadbalancer 8080:80
```

#### Option B: Minikube Production Tunnel (Standard)

Run this command in a separate terminal to emulate a cloud provider's external load balancer routing mesh:

```bash
minikube tunnel
```

#### Test the Endpoint

Execute a test POST request against your running application via cURL:

```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain Kubernetes to a backend engineer in one sentence."}'
```

(If you are using minikube tunnel, change the port from 8080 to 80)

### 🔍 Validation & Chaos Engineering

Use these operational commands to monitor cluster behavior, trace issues, or test system resiliency.

#### Check Statuses & Monitor Logs

```bash
# Watch pods spin up, terminate, or scale in real-time
kubectl get pods -w

# Check the live CPU utilization target status of the HPA
kubectl get hpa ai-service-autoscaler -w

# Stream runtime logs from a specific pod for debugging
kubectl logs <pod-name> -f
```

#### Infrastructure Failure Test (Self-Healing)

Delete an active pod while running your traffic loop to watch Kubernetes route traffic seamlessly to the remaining healthy node while instantly spawning a replacement:

```bash
kubectl delete pod <pod-name>
```

#### Force a Manual Rolling Restart

If you need to force-flush your pods without modifying your configuration manifests:

```bash
kubectl rollout restart deployment/ai-inference-deployment
```
