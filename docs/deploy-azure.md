# Deploying Readthrough to Azure

Readthrough runs on **Azure Container Apps** as two apps built from one Docker image:

| App | Runs | Ingress |
| --- | --- | --- |
| `readthrough-web` | `npm start` (Next.js) | Public HTTPS, port 3000 |
| `readthrough-worker` | `npm run worker` (background reads) | None |

The database stays on **Neon** (Postgres). Images are built in **Azure Container Registry**, so you don't need Docker locally. Both apps run with `JOBS_MODE=worker`: the web app only queues reads, and the worker does them, so a long read survives deploys and restarts (a job whose worker stops is picked up again within a few minutes, resuming at the chapter it stopped on).

## Before you start

- The [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), signed in with `az login`.
- A Neon database. Copy the **pooled** connection string for the app and the **direct** one for migrations. Neon encrypts data at rest, which the privacy policy relies on; if you move the database, keep that true.
- An Anthropic API key. Set a monthly spend limit on its workspace in the Claude Console as a backstop to `AI_DAILY_BUDGET_USD`.
- OAuth apps for GitHub and/or Google (callback URLs are set after the first deploy).
- Stripe keys and price ids (see README → Setting up Stripe).

## 1. Create the database tables

```bash
DATABASE_URL="<neon direct connection string>" npx prisma migrate deploy
```

## 2. Provision Azure

```bash
cp infra/azure/app.env.example infra/azure/app.env   # fill it in; it's gitignored
infra/azure/provision.sh
```

The script creates the resource group, registry, Container Apps environment and both apps, stores every line of `app.env` as a Container Apps secret, and prints the app's address. Then:

1. Put that address in `APP_URL` and `AUTH_URL` in `app.env` and run the script again.
2. Set the OAuth callback URLs to `https://<address>/api/auth/callback/github` and `/google`.
3. Add the Stripe webhook at `https://<address>/api/stripe/webhook` (events listed in the README) and put its signing secret in `STRIPE_WEBHOOK_SECRET`.

Defaults (override with environment variables when running the script): `RG=readthrough-rg`, `LOCATION=centralus`, `WEB=readthrough-web`, `WORKER=readthrough-worker`.

## 3. Deploy from GitHub

`.github/workflows/deploy-azure.yml` deploys every push to `main` (or on demand from the Actions tab): typecheck and tests, `prisma migrate deploy`, image build in the registry, roll-out to both apps, then a health check on `/api/health`. It does nothing until it's configured.

Give GitHub permission to deploy, without storing a password (OIDC):

```bash
SUB=$(az account show --query id -o tsv)
APP=$(az ad app create --display-name readthrough-deploy --query appId -o tsv)
az ad sp create --id "$APP" -o none
az role assignment create --assignee "$APP" --role Contributor --scope "/subscriptions/$SUB/resourceGroups/readthrough-rg"
az role assignment create --assignee "$APP" --role AcrPush --scope "$(az acr show -n <registry name> --query id -o tsv)"
az ad app federated-credential create --id "$APP" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:BardCreates/BetaReader:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
echo "AZURE_CLIENT_ID=$APP AZURE_TENANT_ID=$(az account show --query tenantId -o tsv) AZURE_SUBSCRIPTION_ID=$SUB"
```

In the GitHub repository settings:

- **Environments** → create `production`.
- **Variables**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_ACR_NAME`, `AZURE_CONTAINER_APP_WEB`, `AZURE_CONTAINER_APP_WORKER` (the provision script prints the last four).
- **Secrets**: `DATABASE_URL_DIRECT` (Neon direct connection, for migrations).

## Custom domain

```bash
az containerapp hostname add -g readthrough-rg -n readthrough-web --hostname app.example.com
az containerapp hostname bind -g readthrough-rg -n readthrough-web --hostname app.example.com \
  --environment readthrough-env --validation-method CNAME
```

Then update `APP_URL`, `AUTH_URL`, the OAuth callbacks and the Stripe webhook to the new domain.

## Operating it

- **Logs:** `az containerapp logs show -g readthrough-rg -n readthrough-worker --follow` (or `-web`).
- **More reading capacity:** raise `JOBS_CONCURRENCY` or the worker's replica count. Jobs are claimed with `SKIP LOCKED`, so several workers share the queue safely, and one book is never read twice at once.
- **Stuck or failed jobs:** the `Job` table shows each job's status, attempts and last error. Failed jobs are kept for 30 days.
- **Costs:** `AI_DAILY_BUDGET_USD` pauses all new AI work for the day once reached; `TRIAL_DAILY_BUDGET_USD` and `TRIAL_DAILY_LIMIT` cap free sample reads separately. Every call is logged with its cost in `AiUsage`.
