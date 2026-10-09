# Helm chart

This chart deploys the inference service: a Deployment, a LoadBalancer Service, a Vault SecretStore, and an ExternalSecret. `values-dev.yaml` and `values-prod.yaml` are two profiles for the same templates.

Run Helm from the repository root.

## Profiles

| | Development (`values-dev.yaml`) | Production (`values-prod.yaml`) |
| --- | --- | --- |
| Replicas | 1 | 2 |
| Image | `fcog/ai-inference:v1` | `fcog/ai-inference:v1` |
| Pull policy | `Always` | `IfNotPresent` |
| CPU request | `50m` | `1000m` |
| CPU limit | `200m` | `2000m` |

`Always` pulls the tag whenever a pod is created. Replacing an image that keeps the same tag still needs a rollout restart, because Helm does not recreate pods when the rendered Deployment is unchanged.

The chart does not include a HorizontalPodAutoscaler. `hpa.yaml` at the repository root targets an older Deployment name and is not applied by this chart.

## Install and upgrade

```bash
helm upgrade --install my-ai-app-dev ./services/ai-inference/chart -f ./services/ai-inference/chart/values-dev.yaml
```

```bash
helm upgrade --install my-ai-app-prod ./services/ai-inference/chart -f ./services/ai-inference/chart/values-prod.yaml
```

Object names use the release name:

| Object | Name |
| --- | --- |
| Deployment | `<release>-deployment` |
| Service | `<release>-service-loadbalancer` |
| Pod label | `app=<release>-app` |

For the dev release, port-forward with:

```bash
kubectl port-forward service/my-ai-app-dev-service-loadbalancer 8080:80
```

The Service listens on port 80 and sends traffic to container port 3000.

## Useful commands

```bash
helm lint ./services/ai-inference/chart
helm list
helm history my-ai-app-dev
helm rollback my-ai-app-dev 1
helm uninstall my-ai-app-dev
```

## What the templates read

`templates/deployment.yaml` takes replicas, image, pull policy, and CPU from the values file:

```yaml
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: ai-node-app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
```

The container does not get those settings from a local `.env`. It reads `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `REDIS_URL` from the Secret `ai-app-runtime-secrets`. `templates/external-secret.yaml` creates that Secret from the Vault path `secret/ai-service-credentials`. The store address is in `templates/secret-store.yaml`.

Both External Secrets manifests use `apiVersion: external-secrets.io/v1`, which matches the operator installed on this cluster.
