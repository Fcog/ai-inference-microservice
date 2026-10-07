# Vault and External Secrets

Runtime configuration for the cluster does not come from Git or from `app/.env`. HashiCorp Vault stores the values. The External Secrets Operator copies them into the Kubernetes Secret `ai-app-runtime-secrets`. The Deployment reads that Secret into the process environment when a container starts.

```text
Vault  secret/ai-service-credentials
        │
        ▼
SecretStore vault-backend
        │
        ▼
ExternalSecret ai-service-secure-vault
        │
        ▼
Secret ai-app-runtime-secrets
        │
        ▼
App pod env: AI_PROVIDER, OPENAI_API_KEY, ANTHROPIC_API_KEY, REDIS_URL
```

The app only sees normal environment variables. It does not talk to Vault.

## Install the operator and Vault

```bash
helm repo add external-secrets https://external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace
```

```bash
helm repo add hashicorp https://hashicorp.com
helm repo update
helm install vault hashicorp/vault \
  --namespace vault \
  --create-namespace \
  --set "server.dev.enabled=true" \
  --set "server.dev.devRootToken=root" \
  --set "server.extraArgs=-dev-listen-address=0.0.0.0:8200" \
  --wait
```

Dev mode serves the API over HTTP. From any namespace the Service is:

```text
http://vault.vault.svc.cluster.local:8200
```

That value is `server` in `ai-service-chart/templates/secret-store.yaml`. Port 8200 is the API. Port 8201 on the same Service is Vault's cluster port.

Give the operator the dev root token. The SecretStore reads the key `token` from a Secret named `vault-token` in the app namespace:

```bash
kubectl create secret generic vault-token \
  --namespace default \
  --from-literal=token="root"
```

## Write the application secrets

The ExternalSecret extracts every field at `secret/ai-service-credentials`. The Deployment requires these field names:

- `AI_PROVIDER`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `REDIS_URL`

`vault kv put` stores a new version that contains only the fields in that command. Include all four each time.

```bash
kubectl exec -it vault-0 -n vault -- /bin/sh
vault login root
vault kv put secret/ai-service-credentials \
  AI_PROVIDER="claude" \
  OPENAI_API_KEY="<value from app/.env>" \
  ANTHROPIC_API_KEY="<value from app/.env>" \
  REDIS_URL="redis://my-cache-redis-master:6379"
exit
```

Skip `vault secrets enable -path=secret kv-v2` when that path is already mounted. Dev Vault usually has KV v2 at `secret/` already.

The chart's refresh interval is one hour. Sync immediately after a write:

```bash
kubectl annotate externalsecret ai-service-secure-vault force-sync=$(date +%s) --overwrite
kubectl get externalsecret ai-service-secure-vault
```

`READY` should be `True` and `STATUS` should be `SecretSynced`. Confirm the Secret has the four keys, without printing the values:

```bash
kubectl get secret ai-app-runtime-secrets \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
```

## Pick up a changed value

A running container keeps the environment it started with. After the Secret changes, restart the Deployment:

```bash
kubectl rollout restart deployment/my-ai-app-dev-deployment
kubectl rollout status deployment/my-ai-app-dev-deployment
```

Then check the provider inside the new pod:

```bash
kubectl exec deployment/my-ai-app-dev-deployment -- printenv AI_PROVIDER
```

If a new pod stays in `CreateContainerConfigError`, the Secret is missing one of the four keys. The previous ready pod keeps serving traffic until the new one starts.
