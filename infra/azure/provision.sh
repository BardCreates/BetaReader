#!/usr/bin/env bash
# Creates everything Readthrough needs in Azure, once:
#   resource group, container registry, Container Apps environment (with logs),
#   a web app (public HTTPS) and a worker app (no ingress), both from one image.
#
# Usage:
#   az login
#   cp infra/azure/app.env.example infra/azure/app.env   # fill it in (never commit it)
#   infra/azure/provision.sh
#
# Re-running updates the apps' settings from app.env. Safe to run again.
set -euo pipefail

RG="${RG:-readthrough-rg}"
LOCATION="${LOCATION:-centralus}"
# Registry names are global; derive a stable one from the subscription so re-runs reuse it.
ACR="${ACR:-readthrough$(az account show --query id -o tsv | tr -d - | cut -c1-10)}"
ENV_NAME="${ENV_NAME:-readthrough-env}"
WEB="${WEB:-readthrough-web}"
WORKER="${WORKER:-readthrough-worker}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/app.env}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE (copy app.env.example and fill it in)"; exit 1; }
az extension add --name containerapp --upgrade --only-show-errors >/dev/null

echo "→ Resource group $RG ($LOCATION)"
az group create -n "$RG" -l "$LOCATION" -o none

if ! az acr show -n "$ACR" -g "$RG" -o none 2>/dev/null; then
  echo "→ Container registry $ACR"
  az acr create -n "$ACR" -g "$RG" --sku Basic -o none
fi

echo "→ First image (built in Azure, nothing to install locally)"
az acr build --registry "$ACR" --image readthrough:latest "$(dirname "$0")/../.." -o none

if ! az containerapp env show -n "$ENV_NAME" -g "$RG" -o none 2>/dev/null; then
  echo "→ Container Apps environment $ENV_NAME"
  az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" -o none
fi

# Every setting becomes a Container Apps secret, referenced by an env var of the same name.
secrets=()
envs=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  value="${value%\"}"; value="${value#\"}"
  [[ -z "$value" ]] && continue
  name=$(echo "$key" | tr '[:upper:]_' '[:lower:]-')
  secrets+=("$name=$value")
  envs+=("$key=secretref:$name")
done < "$ENV_FILE"
envs+=("JOBS_MODE=worker" "AUTH_TRUST_HOST=true" "NODE_ENV=production")

IMAGE="$ACR.azurecr.io/readthrough:latest"

create_or_update() {
  local app="$1"; shift
  if az containerapp show -n "$app" -g "$RG" -o none 2>/dev/null; then
    az containerapp secret set -n "$app" -g "$RG" --secrets "${secrets[@]}" -o none
    az containerapp update -n "$app" -g "$RG" --image "$IMAGE" --set-env-vars "${envs[@]}" "$@" -o none
  else
    az containerapp create -n "$app" -g "$RG" --environment "$ENV_NAME" --image "$IMAGE" \
      --registry-server "$ACR.azurecr.io" --registry-identity system \
      --secrets "${secrets[@]}" --env-vars "${envs[@]}" "$@" -o none
  fi
}

echo "→ Web app $WEB"
create_or_update "$WEB" --ingress external --target-port 3000 --min-replicas 1 --max-replicas 3 --cpu 1 --memory 2Gi

echo "→ Worker app $WORKER"
create_or_update "$WORKER" --command npm --args "run" "worker" --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1Gi

FQDN=$(az containerapp show -n "$WEB" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
cat <<EOF

Done. The app is at https://$FQDN
Next:
  1. Set APP_URL (and AUTH_URL) in $ENV_FILE to https://$FQDN (or your own domain) and re-run this script.
  2. Point your OAuth apps' callback URLs at https://$FQDN/api/auth/callback/github and /google.
  3. Add the Stripe webhook at https://$FQDN/api/stripe/webhook.
  4. For automatic deploys from GitHub, see docs/deploy-azure.md (repository variables:
     AZURE_RESOURCE_GROUP=$RG AZURE_ACR_NAME=$ACR AZURE_CONTAINER_APP_WEB=$WEB AZURE_CONTAINER_APP_WORKER=$WORKER).
EOF
