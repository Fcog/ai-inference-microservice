# 🐙 Argo CD GitOps Synchronization

This directory documents how the local Minikube cluster achieves automated continuous deployment using **Argo CD** and the **GitOps** philosophy.

By applying the `argo-app.yaml` manifest, Argo CD pulls the Helm chart straight from GitHub and handles the installation loop automatically.

---

## 🔄 The Pull-Based GitOps Cycle

Traditional CD pipelines "push" code into a cluster by exposing cluster keys to external runners. Argo CD turns this around by running _inside_ the cluster and "pulling" updates securely:

```text
[ GitHub Repo ] ◄──────────────────────────────────────┐
 (Main Branch)                                         │
       │                                               │ Continually Polls for
       ▼ (GitHub Actions updates values-prod.yaml)     │ Tag Modifications (10s)
┌──────────────┐                                       │
│ Changed Tag  │                                       │
└──────────────┘                               ┌───────┴───────┐
                                               │    Argo CD    │
                                               │ (In-Cluster)  │
                                               └───────┬───────┘
                                                       │
                                                       ▼ Executes Rolling Update
                                                [ Minikube Pods ]
```

1. **The Code Trigger:** GitHub Actions builds your code and pushes the new image tag into your repository's `values-prod.yaml` file.
2. **The Sync Check:** Argo CD polls your repository every few minutes (or receives a webhook). It notices that the `tag:` value in Git no longer matches what is running inside Minikube.
3. **Automated Remediation:** Argo CD executes a headless `helm template` rendering, generates the updated plain YAML, and applies it to the cluster automatically.

---

## 🛠️ Bootstrapping Argo CD Locally

Follow these steps to install Argo CD inside your Minikube cluster and activate the tracking engine:

### 1. Install Argo CD Components

```bash
# Create a isolated system namespace
kubectl create namespace argocd

# Apply the official upstream Argo CD installation manifest stack
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all the Argo control components to turn green and live
kubectl wait --namespace argocd --for=condition=ready pod --all --timeout=90s
```

### 2. Connect the Application to Git

`infrastructure/argocd/argo-app.yaml` points `repoURL` at `https://github.com/Fcog/ai-inference-microservice.git` and deploys into this cluster at `https://kubernetes.default.svc`. Apply it with:

```bash
# Submit the Application manifest to the cluster controller
kubectl apply -f infrastructure/argocd/argo-app.yaml
```

### 3. Access the Argo CD Graphical Dashboard

To visually watch your pods, services, and health states compile into a real-time topology map, spin up the dashboard port-forward tunnel:

```bash
# Map the secure interface dashboard to your local localhost port
kubectl port-forward svc/argocd-server -n argocd 8081:443
```

- **URL:** Open your browser and navigate to `https://localhost:8081` (bypass the SSL warning).
- **Username:** `admin`
- **Password:** Fetch your auto-generated cluster entry password by executing:
  ```bash
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode; echo
  ```

---

## 🛡️ Enterprise Feature: Automated Self-Healing

Because the `syncPolicy` has `selfHeal: true` activated, your infrastructure is immune to unauthorized config drift:

- **The Test:** Scale the Deployment to zero:

  ```bash
  kubectl scale deployment/ai-inference-service-prod-deployment --replicas=0
  ```
- **The Result:** Watch the Argo CD dashboard interface. Within seconds, Argo CD will mark the cluster status as `OutOfSync`, reject your manual changes, and automatically spin the pods back up to match exactly what is committed inside your GitHub code repository.
