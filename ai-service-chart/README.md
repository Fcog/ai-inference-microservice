# ⛵ Helm Chart Configuration & Multi-Environment Packaging

This directory contains the **Helm Chart** packaging layer for the AI inference microservice. Instead of maintaining static, duplicated Kubernetes YAML manifests, Helm acts as a template engine that bundles our infrastructure states into a single release package managed by a central configuration parameters file (`values.yaml`).

---

## 📈 Multi-Environment Staging Strategy

The chart utilizes separate value configuration profiles to seamlessly deploy the exact same core infrastructure templates into structurally isolated environments (**Development** vs. **Production**).

### Environment Profiles Overview

| Architectural Layer     | Development (`values-dev.yaml`)           | Production (`values-prod.yaml`)                              |
| :---------------------- | :---------------------------------------- | :----------------------------------------------------------- |
| **Instance Count**      | `replicaCount: 1` (Minimizes footprint)   | `replicaCount: 5` (High Availability / Traffic Spreading)    |
| **Image Policy**        | `pullPolicy: Always` (Rapid tag tracking) | `pullPolicy: IfNotPresent` (Optimized start/hardlocked tags) |
| **Resource Allocation** | `cpu: 50m` (Fractional low-cost share)    | `cpu: 1000m` (Dedicated CPU/GPU cores allocated)             |
| **Autoscaling (HPA)**   | Disabled (Not required for manual tests)  | Enabled (`min: 2`, `max: 6` matching target thresholds)      |

---

## 🚀 Execution & Staging Commands

To install, switch, or upgrade your running instances across different environments, pass the targeted parameters profile using the `-f` deployment flag:

### 1. Deploying to the Development Environment

```bash
# Install or upgrade the Development release
helm upgrade --install my-ai-dev ./ai-service-chart -f ./ai-service-chart/values-dev.yaml
```

### 2. Deploying to the Production Environment

```bash
# Install or upgrade the Production release
helm upgrade --install my-ai-prod ./ai-service-chart -f ./ai-service-chart/values-prod.yaml
```

---

## 🛠️ Helm Lifecycle Management Essentials

Use these operational commands to audit, control, and manipulate your packaged releases inside the cluster:

```bash
# 1. Lint the chart folder to analyze template syntax formatting errors
helm lint ./ai-service-chart

# 2. View all active Helm applications currently tracking inside the cluster
helm list

# 3. Inspect the history of upgrades, version modifications, and deployments
helm history my-ai-prod

# 4. Roll back to a previous safe deployment revision if a production release fails
# Syntax: helm rollback <release-name> <revision-number>
helm rollback my-ai-prod 1

# 5. Purge a running app release and cleanly delete all of its tracking K8s resources
helm uninstall my-ai-dev
```

---

## 💡 How Template Parametrization Works Under the Hood

Inside the `./templates/` folder, static strings are replaced by dynamic template variables. For instance, our deployment template configures its values via references like this:

```yaml
spec:
  replicas: { { .Values.replicaCount } }
  containers:
    - name: node-app
      image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
      imagePullPolicy: { { .Values.image.pullPolicy } }
```

When a deployment command is run, Helm instantly overrides these values with the values declared inside your selected environment file (`values-dev.yaml` or `values-prod.yaml`), outputting a fully validated manifest to the Kubernetes API.
