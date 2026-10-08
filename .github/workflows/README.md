# 🤖 CI/CD Automation & GitOps Pipeline

This directory documents the Continuous Integration (CI) and Continuous Deployment (CD) strategy. The project leverages **GitHub Actions** and **Docker Hub** to build a secure, automated, and audit-ready delivery pipeline following modern **GitOps** infrastructure patterns.

---

## 🔁 The Automated Delivery Loop

Rather than manually building images or executing raw deployment commands from a local machine, infrastructure updates follow a strict unidirectional cycle triggered on every codebase merge:

```text
  [ Developer Merges PR to Main ]
                 │
                 ▼
     ┌───────────────────────┐
     │  GitHub Actions Runs  │ ───► Executes application unit tests
     └───────────┬───────────┘
                 │
                 ├───────────────────────────────┐
                 ▼ (Build & Tag via SHA)         ▼ (GitOps Hydration Step)
       ┌───────────────────┐           ┌──────────────────────────┐
       │ Docker Hub Registry│           │  Update Git Repository   │
       │ (fcog/ai-inference)│           │ (values-dev / values-prod)│
       └───────────────────┘           └────────────┬─────────────┘
                                                    │
                                                    ▼
                                       ┌──────────────────────────┐
                                       │   Argo CD Pull Trigger   │
                                       │ (Automated Cluster Sync) │
                                       └──────────────────────────┘
```

1. **Continuous Integration (CI):** When code merges into `main`, GitHub Actions pulls down the repo, triggers code dependency testing, validates container assembly, and tags the output image using the unique **GitHub Git Commit SHA**.
2. **Registry Distribution:** The newly compiled, high-performance image layer is pushed directly to the cloud repository workspace on **Docker Hub** (`fcog/ai-inference:<commit-sha>`).
3. **Continuous Deployment (CD) Via GitOps:** The pipeline configures a native Git runner to rewrite the configuration layers (`values-dev.yaml` and `values-prod.yaml`) inside your Helm folder with the new tag value, committing the tracking adjustment directly back to the `main` branch.
4. **Cluster Sync:** An internal cluster controller (e.g., Argo CD) continuously tracks the repo configuration. The millisecond it registers the automated bot commit, it triggers a rolling rollout inside your cluster to match the specified Git state.

---

## 🔒 Security Configuration & Environment Keys

To authenticate the pipeline securely without hardcoding plain-text credentials in the repository configuration files, you must map the following **Repository Secrets** within your GitHub project structure under **Settings** -> **Secrets and variables** -> **Actions**:

### Required Repository Secrets

- `DOCKERHUB_USERNAME`: Your exact Docker Hub workspace name (`fcog`).
- `DOCKERHUB_TOKEN`: A Personal Access Token (PAT) generated from your Docker Hub Account Settings under _Security_.
  - _Note: This PAT must be granted **Read, Write, Delete** (or Read & Write) clearance so the action runner has permission to push new container layers to your registry._

### Runner Authorization Requirements

Because the pipeline must dynamically alter files (`values.yaml`) and push those infrastructure modifications back up into your source branch, you must modify the native workflow engine clearance:

1. Navigate to **Settings** -> **Actions** -> **General** on GitHub.
2. Scroll down to **Workflow permissions**.
3. Toggle the selection field to **Read and write permissions** and click **Save**.

---

## 🧠 Core Engineering Optimizations

- **Docker Cache-Backing Layer:** The pipeline includes a highly optimized cache system block (`cache-from: type=gha` and `cache-to: type=gha,mode=max`). This ensures subsequent builds reuse unmodified TypeScript compiled layers instantly, reducing deployment build windows down significantly.
- **Infinite Loop Circuit Breaker (`[skip ci]`):** When the workflow bot commits the updated image tag configurations back to your branch, it appends a `[skip ci]` string block inside the automated commit message. This instructs the GitHub Actions engine **not** to trigger a recursive pipeline loop execution when the YAML update is committed.
- **Immutability Strategy:** Using the exact `github.sha` commit key value as the primary deployment label eliminates the risks associated with utilizing dynamic mutable tags like `:latest` in production environments. This creates a clean audit trail, enabling exact code tracking and allowing for reliable infrastructure rollbacks via Helm or Argo CD at a moment's notice.
