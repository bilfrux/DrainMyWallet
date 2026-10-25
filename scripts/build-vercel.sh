#!/usr/bin/env bash
# Builds the site for Stellar testnet and lays it out as a Vercel "prebuilt"
# deployment in .vercel/output, so Vercel never has to run the Stellar CLI
# (the generated contract clients need Rust and the Stellar CLI, which Vercel
# does not have).
#
#   scripts/build-vercel.sh                 # build only
#   npx vercel deploy --prebuilt --prod     # then publish (needs `vercel login` and `vercel link`)
#
# Reads the factory id from deployments/testnet.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="deployments/testnet.env"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE: run scripts/deploy.sh testnet first" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

# Build-time values the site bakes in.
export STELLAR_NETWORK=testnet
export PUBLIC_FACTORY_CONTRACT_ID="$FACTORY_ID"

echo "==> Generating testnet contract clients"
npm install --silent
stellar scaffold build --network testnet >/dev/null

echo "==> Building the site (factory $FACTORY_ID)"
npm run build --workspace app

echo "==> Laying out .vercel/output"
rm -rf .vercel/output
mkdir -p .vercel/output/static
cp -R app/dist/. .vercel/output/static/
# Serve real files first, send every other path to the single-page app so a
# direct link such as /level/5 does not 404.
cat > .vercel/output/config.json <<'JSON'
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
JSON

echo "==> Done: $(du -sh .vercel/output/static | cut -f1) in .vercel/output/static"
echo "Publish with: npx vercel deploy --prebuilt --prod"
