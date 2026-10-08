# CI/CD

`.github/workflows/deploy.yaml` is the only workflow. One job, `build-and-push`, runs on `ubuntu-latest` after a push to `main`. It installs app dependencies, builds the image from `app/`, pushes it to Docker Hub, then commits the new image tag into both Helm values files.

The workflow does not open pull requests, does not run Helm, and does not talk to the cluster. Nothing in this repository installs Argo CD or another GitOps controller. Applying the chart is still a separate `helm upgrade`, documented in [ai-service-chart/README.md](../../ai-service-chart/README.md).

## Trigger

```yaml
on:
  push:
    branches:
      - main
```

Any push to `main` starts the job, including a direct push. Opening or updating a pull request does not. There is no path filter, so a docs-only change on `main` still builds and pushes an image.

The bot commit described below includes `[skip ci]`. GitHub Actions does not start a workflow for a push whose commit message contains `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, or `[actions skip]`. That stops the values-file commit from running the pipeline again.

## Steps

The steps run in order in a single job. The GitOps commit runs only after the image push succeeds.

```text
push to main
      │
      ▼
checkout, Node 20, npm ci in app/
      │
      ▼
docker build ./app  →  push fcog/ai-inference:<sha> and :latest
      │
      ▼
set image.tag in values-dev.yaml and values-prod.yaml
      │
      ▼
commit and push to main with [skip ci]
```

1. **Checkout** with `actions/checkout@v4`. The default token is kept so the later `git push` can authenticate.
2. **Node.js 20** with `actions/setup-node@v4`. The npm cache key is `app/package-lock.json`.
3. **Install** with `npm ci` inside `app/`. The same step runs `npm run test --if-present`. `app/package.json` has no `test` script and the repo has no test files, so this command exits successfully and does not run tests. `npm run typecheck` is not part of the workflow.
4. **Docker Buildx** via `docker/setup-buildx-action@v3`.
5. **Docker Hub login** via `docker/login-action@v3`, using `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
6. **Build and push** via `docker/build-push-action@v5`. The context is `./app` and the Dockerfile is `./app/Dockerfile`. BuildKit stores layer cache in GitHub Actions (`cache-from: type=gha`, `cache-to: type=gha,mode=max`).
7. **Rewrite the Helm tags and push a commit.** The runner sets `user.name` to `GitHub Actions Bot` and `user.email` to `actions@github.com`, then runs:

```bash
sed -i 's/tag: .*/tag: "<github.sha>"/' ./ai-service-chart/values-dev.yaml
sed -i 's/tag: .*/tag: "<github.sha>"/' ./ai-service-chart/values-prod.yaml
```

`sed` replaces the rest of every line that contains `tag:`. In the current values files that is only `image.tag`. A comment on that line is removed. The committed value is a quoted string, for example `tag: "a1b2c3d..."`. Dev and prod receive the same SHA. There is no approval step between them.

The commit message is `chore(gitops): automated image tag update to <sha> [skip ci]`, and the runner pushes it to `origin main`.

## Image tags

Each successful run pushes two tags of the same image:

| Tag | Example | Used by |
| --- | --- | --- |
| Full commit SHA | `fcog/ai-inference:a1b2c3d4...` | `image.tag` in both values files |
| `latest` | `fcog/ai-inference:latest` | Nothing in the chart. The values files are not set to `latest`. |

The repository name `fcog/ai-inference` is hardcoded in the workflow and in the values files. It is not taken from `DOCKERHUB_USERNAME`. The account in that secret needs permission to push to that repository.

`github.sha` on a push event is the full 40-character commit id. Helm renders it as `image: "fcog/ai-inference:<sha>"`. Changing the tag changes the Deployment spec, so the next `helm upgrade` rolls the pods. Rollback is `helm rollback` to a release that still points at an earlier SHA, as long as that image is still on Docker Hub.

## Repository secrets

Create these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub account that can push to `fcog/ai-inference` (`fcog` when that account owns the repository) |
| `DOCKERHUB_TOKEN` | Docker Hub access token with **Read & Write**. The workflow only pushes; it does not delete tags. |

Create the token in Docker Hub under **Account Settings → Security → Personal access tokens**.

## Permissions

The job sets `permissions: contents: write` so the `GITHUB_TOKEN` can push the values commit. That request only works when the repository allows it:

1. Open **Settings → Actions → General**.
2. Under **Workflow permissions**, select **Read and write permissions**.
3. Save.

A branch rule that blocks direct pushes to `main` also blocks this commit, unless the `GITHUB_TOKEN` is allowed to bypass it.
