# Zaynab Cooks

A warm, premium home-food storefront built with Vite and a Node server. It includes a searchable 40-dish tray menu, real kitchen photography, a basket with explicit portion sizes, WhatsApp order requests, review previews, Nunito from Google Fonts, and a spinning Craving Club. Business details and the menu live in [src/catalog.js](src/catalog.js); see [food asset and content setup](docs/food-assets.md) for photo provenance, menu setup, and the remaining sample reviews.

## Local development

Use Node.js 24 LTS:

```powershell
npm ci
npm run dev
```

## Build and check

```powershell
npm run lint
npm run format:check
npm run build
npm run test:ci
npm run package:ci
npm start
```

The built site is served on `http://localhost:8080/` (or the `PORT` environment variable). `dist/`, `deploy/`, `coverage/`, and `node_modules/` are generated output. The Node server uses built-in modules, with no production npm dependencies.

## Health endpoint

`GET /healthz` returns `{ "status": "ok", "revision": "local" }` locally. In Azure, the pipeline stamps the actual commit into the package's `release.json`. The endpoint checks the built page and referenced assets, returning HTTP 503 when they are missing. It exposes no configuration or secrets.

After deployment, the central pipeline requires HTTP 200, `status: "ok"`, the expected deployed commit, and a successful home-page response. It retries during startup and fails the deployment check when these conditions do not pass. This readiness and deployment smoke check confirms the new release is serving its built files; HTTP 200 alone could come from an older release. It does not exercise browser interactions or business flows.

## Central CI/CD caller

`.github/workflows/caller-ci-cd.yml` calls two central reusable workflows:

- `reusable-app-ci.yml@main` validates PRs when opened, updated, or reopened. When a PR merges into `main`, it validates the exact merged revision again, prepares the application ZIP, and returns its artifact ID, SHA-256, and commit only after CI succeeds. Sonar analyzes the merged revision as `main`; configure that as the Sonar project main branch too.
- `reusable-app-cd.yml@main` runs with `needs: ci` only after a PR merges into the actual default branch (`main` here). It verifies the same-run ZIP and merged commit before Azure OIDC login, deploys without rebuilding, and checks the running application. Only this call requests `id-token: write`.

PR validation runs CI without deployment packaging. A merged PR runs CI again on the merged revision, then deploys to the dedicated **non-production Azure App Service** after its gates succeed. Closing a PR without merging, direct pushes, and manual runs do not deploy; manual runs perform CI only. Fork-origin PR calls and events initiated by Dependabot remain skipped because they cannot be given the Sonar secret; mandatory gates are not weakened. New PR validation can cancel older validation for that PR, while merged delivery runs keep their own concurrency group. Docker, GHCR, and container scanning remain optional and disabled here. For CI alone, call only `reusable-app-ci.yml` and leave `package_app` disabled.

Configure repository variables `SONAR_PROJECT_KEY`, `AZURE_WEBAPP_NAME`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and the named `SONAR_TOKEN` secret. Create the GitHub `non-production` Environment and the matching Azure federated identity. Follow the [central setup and rollback runbook](https://github.com/Lekanlekzy/stage1-devsecops/blob/main/docs/stage-1/azure-app-service.md). Make both central workflow definitions available on `main` before using this caller.

Cloud resources and repository variables must be configured before the first successful deployment. The workflow does not provision resources. Health-check failure is reported without automatic rollback; the runbook redeploys a retained package from a previous successful run.

## Container CI/CD

`.github/workflows/caller-container-ci-cd.yml` is an additional caller using `Lekanlekzy/stage1-devsecops@Adhoc-CI-CD` for both reusable workflows:

- `reusable-app-ci.yml` runs Node checks, Sonar, dependency/secret scans, and a Docker build with Trivy. Open PRs and manual runs validate without publishing or deploying.
- After a same-repository PR merges into the actual default branch, CI rebuilds that exact merge commit and publishes its scanned image to `ghcr.io/lekanlekzy/simple_web_app`. With `needs: ci`, `reusable-container-cd.yml` deploys that image by its immutable digest to Azure Container Apps and checks `/healthz` for `status: "ok"` and the same commit.

The existing ZIP/App Service caller remains separate. With both workflows enabled, matching PR events run both CI paths, including two Sonar analyses; a merge can deploy to both configured Azure targets. Choose the delivery path you want before enabling both in GitHub. The central references use the case-sensitive `Adhoc-CI-CD` branch; they do not select an application checkout branch.

Configure these **repository variables** for the container caller:

- `AZURE_CONTAINER_APP_NAME`: existing Azure Container App.
- `AZURE_CONTAINER_NAME`: container within that app.
- `AZURE_RESOURCE_GROUP`: resource group containing the app.
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`: Azure OIDC identity configuration.

Use the existing named `SONAR_TOKEN` secret for `Lekanlekzy_simple_web_app`. Create the GitHub `non-production` Environment and its matching Azure federated identity. Grant that identity access to update the Container App and its ingress traffic. Provision external HTTPS ingress targeting port `8080`, readiness probes, and GHCR image pull access on Azure before deploying. For a private GHCR package, configure a read-only package credential on Azure; the workflow does not pass a registry secret to CD. Multiple-revision deployments send all ingress traffic to the new revision. Cloud deployment and rollback are unverified until real runs succeed.

The Dockerfile uses separate Node 24 build and runtime stages. It installs locked build dependencies, creates the Vite assets, and stamps `release.json` from CI's `APP_REVISION` build argument. The final image runs as `node` with only the built site, server, and revision file. Central CI adds the source/revision OCI labels. Generated output and local configuration are excluded by `.dockerignore`.

To build and run locally with Docker Desktop configured for Linux containers:

```powershell
$revision = git rev-parse HEAD
docker build --build-arg "APP_REVISION=$revision" -t simple-web-app:local .
docker run --rm -p 8080:8080 simple-web-app:local
```

Then open `http://localhost:8080/healthz` in another terminal or browser and confirm its revision. Docker builds, Trivy scanning, and Azure deployment have not been verified locally for this change.

## Supply-chain evidence

Stage 1 records the deployment ZIP's SHA-256 and source revision. Its tests exercise the built site and server before packaging; the final ZIP itself is not yet runtime-tested. ZIP is the Azure Node deployment format, rather than a format required for every language.

SBOM generation, signed build provenance/attestations, and CD verification of the expected builder and artifact are scheduled for Stage 2 in the central roadmap. A checksum detects changed bytes; it does not provide signed proof of origin. No SBOM or attestation is generated by this caller today.
