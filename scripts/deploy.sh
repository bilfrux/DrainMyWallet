#!/usr/bin/env bash
# Deploys the whole game to a network: game asset + SAC, factory, $DRAIN XP
# token, and every level whose crate exists under contracts/levels/.
#
#   scripts/deploy.sh [network] [admin-identity]
#   scripts/deploy.sh testnet drain-admin
#
# Env:
#   ASSET_CODE          game asset code (default LOOT)
#   WITH_TEST_LEVEL=1   also register contracts/test-level as level 99 (local smoke test)
#
# The factory mints each instance's funding, so it becomes the admin of the
# game asset's SAC. On a redeploy the previous factory hands the role over.
#
# Writes the resulting ids to deployments/<network>.env.
set -euo pipefail

NETWORK="${1:-testnet}"
ADMIN="${2:-drain-admin}"
ASSET_CODE="${ASSET_CODE:-LOOT}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM_DIR="$ROOT/target/wasm32v1-none/release"
OUT="$ROOT/deployments/$NETWORK.env"
# The factory being replaced, if any: it holds the SAC admin role
PREVIOUS_FACTORY="$(sed -n 's/^FACTORY_ID=//p' "$OUT" 2>/dev/null || true)"

# id  package                  funding (stroops)  xp
LEVELS=(
  "1 level-01-open-door       10000000000 100"
  "2 level-02-crown           10000000000 200"
  "3 level-03-wrong-signer    0           300"
  "4 level-04-fatal-cast      0           400"
  "5 level-05-forgetful-list  0           500"
  "6 level-06-counterfeit     10000000000 600"
  "7 level-07-negative-space  0           150"
  "8 level-08-name-clash      0           350"
  "9 level-09-time-warp       10000000000 350"
)
if [[ "${WITH_TEST_LEVEL:-0}" == "1" ]]; then
  LEVELS+=("99 test-level 10000000000 1")
fi

net() { echo "--network $NETWORK --source-account $ADMIN"; }
log() { printf '\n==> %s\n' "$*"; }

log "Admin identity '$ADMIN' on $NETWORK"
if ! stellar keys address "$ADMIN" >/dev/null 2>&1; then
  stellar keys generate "$ADMIN" --network "$NETWORK" --fund
else
  stellar keys fund "$ADMIN" --network "$NETWORK" >/dev/null 2>&1 || true
fi
ADMIN_ADDR="$(stellar keys address "$ADMIN")"
echo "$ADMIN_ADDR"

log "Building contracts"
# A level is deployed only once its crate exists in the workspace.
in_workspace() {
  [[ "$1" == "test-level" ]] && return 0
  grep -qs "^name = \"$1\"" "$ROOT"/contracts/levels/*/Cargo.toml
}
packages=(factory xp-token)
for entry in "${LEVELS[@]}"; do
  read -r _ pkg _ _ <<<"$entry"
  if in_workspace "$pkg"; then
    packages+=("$pkg")
  fi
done
for pkg in "${packages[@]}"; do
  stellar contract build --package "$pkg" --manifest-path "$ROOT/Cargo.toml" >/dev/null
  echo "built $pkg"
done

log "Game asset $ASSET_CODE and its Stellar Asset Contract"
ASSET="$ASSET_CODE:$ADMIN_ADDR"
TOKEN_ID="$(stellar contract asset deploy --asset "$ASSET" $(net) 2>/dev/null ||
  stellar contract id asset --asset "$ASSET" --network "$NETWORK")"
echo "$TOKEN_ID"

# Uploaded first so the hashes can be recorded: scripts/extend.sh needs them
log "Factory"
FACTORY_WASM_HASH="$(stellar contract upload --wasm "$WASM_DIR/factory.wasm" $(net))"
FACTORY_ID="$(stellar contract deploy --wasm-hash "$FACTORY_WASM_HASH" $(net) \
  -- --admin "$ADMIN_ADDR" --token "$TOKEN_ID")"
echo "$FACTORY_ID"

log "XP token (\$DRAIN)"
XP_TOKEN_WASM_HASH="$(stellar contract upload --wasm "$WASM_DIR/xp_token.wasm" $(net))"
XP_ID="$(stellar contract deploy --wasm-hash "$XP_TOKEN_WASM_HASH" $(net) \
  -- --factory "$FACTORY_ID")"
echo "$XP_ID"
stellar contract invoke --id "$FACTORY_ID" $(net) -- set_xp_token --xp_token "$XP_ID" >/dev/null

log "Handing the $ASSET_CODE admin role to the factory"
TOKEN_ADMIN="$(stellar contract invoke --id "$TOKEN_ID" $(net) -- admin | tr -d '"')"
if [[ "$TOKEN_ADMIN" == "$ADMIN_ADDR" ]]; then
  stellar contract invoke --id "$TOKEN_ID" $(net) -- set_admin --new_admin "$FACTORY_ID" >/dev/null
elif [[ -n "$PREVIOUS_FACTORY" && "$TOKEN_ADMIN" == "$PREVIOUS_FACTORY" ]]; then
  stellar contract invoke --id "$PREVIOUS_FACTORY" $(net) -- \
    set_token_admin --new_admin "$FACTORY_ID" >/dev/null
else
  echo "error: the $ASSET_CODE admin is $TOKEN_ADMIN, neither $ADMIN nor the previous factory" >&2
  exit 1
fi
echo "admin is now $FACTORY_ID"

mkdir -p "$(dirname "$OUT")"
{
  echo "NETWORK=$NETWORK"
  echo "ADMIN=$ADMIN_ADDR"
  echo "GAME_ASSET=$ASSET"
  echo "GAME_TOKEN_ID=$TOKEN_ID"
  echo "FACTORY_ID=$FACTORY_ID"
  echo "FACTORY_WASM_HASH=$FACTORY_WASM_HASH"
  echo "XP_TOKEN_ID=$XP_ID"
  echo "XP_TOKEN_WASM_HASH=$XP_TOKEN_WASM_HASH"
} >"$OUT.tmp"

log "Registering levels"
for entry in "${LEVELS[@]}"; do
  read -r id pkg funding xp <<<"$entry"
  wasm="$WASM_DIR/${pkg//-/_}.wasm"
  if ! in_workspace "$pkg"; then
    echo "skip level $id ($pkg not in the workspace yet)"
    continue
  fi
  hash="$(stellar contract upload --wasm "$wasm" $(net))"
  stellar contract invoke --id "$FACTORY_ID" $(net) -- register_level \
    --level_id "$id" --wasm_hash "$hash" --funding "$funding" --xp_reward "$xp" >/dev/null
  echo "level $id: $pkg  wasm=$hash  funding=$funding  xp=$xp"
  echo "LEVEL_${id}_WASM_HASH=$hash" >>"$OUT.tmp"
done

mv "$OUT.tmp" "$OUT"
log "Done. Ids written to ${OUT#"$ROOT/"}"
cat "$OUT"
