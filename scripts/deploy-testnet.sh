#!/usr/bin/env bash
# Deploys a fresh DrainMyWallet game on Stellar testnet:
#   1. admin + player identities, funded with Friendbot
#   2. game token: classic asset issued by admin, wrapped in its SAC
#   3. factory (admin, token) + $DRAIN XP token (factory), then set_xp_token
#   4. level Wasm uploads + register_level(level_id, wasm_hash, funding, xp_reward)
#   5. factory provisioned with game tokens so it can fund new instances
#
# Identities, the SAC and the player's trustline are reused across runs.
# The factory and the XP token are redeployed on every run (fresh game).
#
# Usage:   scripts/deploy-testnet.sh
#          DRY_RUN=1 scripts/deploy-testnet.sh     # print commands, send nothing
# Output:  scripts/deployments/testnet.json
#
# Tunables (env): ADMIN, PLAYER, ASSET_CODE, FUND_INSTANCES, WITH_TEST_LEVEL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
ADMIN="${ADMIN:-admin}"
PLAYER="${PLAYER:-player}"
ASSET_CODE="${ASSET_CODE:-LOOT}"
# How many instances per level the factory can fund before it needs a top-up.
FUND_INSTANCES="${FUND_INSTANCES:-50}"
# Register contracts/test-level as level 0, for an end-to-end smoke test
# (new_instance -> win -> submit) before the real levels exist.
WITH_TEST_LEVEL="${WITH_TEST_LEVEL:-0}"
DRY_RUN="${DRY_RUN:-0}"

# Classic assets always have 7 decimals through their SAC.
TOKEN_SCALE=10000000
WASM_DIR="$ROOT/target/deploy-wasm"
OUT_FILE="$ROOT/scripts/deployments/$NETWORK.json"

# Level table. Funding is in whole game tokens, given to each new instance.
# Levels whose directory does not exist yet are skipped.
#  id  dir                                   xp   funding
LEVELS="
   1   contracts/levels/01-open-door         100  1000
   2   contracts/levels/02-crown             200  1000
   3   contracts/levels/03-wrong-signer      300  1000
   4   contracts/levels/04-fatal-cast        400  0
   5   contracts/levels/05-forgetful-list    500  0
"
if [ "$WITH_TEST_LEVEL" = 1 ]; then
  LEVELS="$LEVELS
   0   contracts/test-level                  1    10
"
fi

# ---------------------------------------------------------------------------
# Factory / XP token interface.
# NOT FROZEN: the factory is not coded yet. Everything that depends on its
# exact function and argument names lives in this block, so re-aligning the
# script means editing only these functions.
# ---------------------------------------------------------------------------

# factory::__constructor(admin: Address, token: Address)
deploy_factory() {
  sx contract deploy --wasm "$(wasm_of factory)" --alias dmw-factory \
    --source "$ADMIN" --network "$NETWORK" \
    -- --admin "$ADMIN_ADDR" --token "$TOKEN_ID"
}

# xp_token::__constructor(factory: Address)  (already coded)
deploy_xp_token() {
  sx contract deploy --wasm "$(wasm_of xp-token)" --alias dmw-xp-token \
    --source "$ADMIN" --network "$NETWORK" \
    -- --factory "$FACTORY_ID"
}

# factory::set_xp_token(xp_token: Address), admin only, callable once
set_xp_token() {
  sx contract invoke --id "$FACTORY_ID" --source "$ADMIN" --network "$NETWORK" \
    -- set_xp_token --xp_token "$XP_ID" >/dev/null
}

# factory::register_level(level_id: u32, wasm_hash: BytesN<32>, funding: i128, xp_reward: i128)
register_level() { # level_id wasm_hash funding_base_units xp_reward
  sx contract invoke --id "$FACTORY_ID" --source "$ADMIN" --network "$NETWORK" \
    -- register_level --level_id "$1" --wasm_hash "$2" --funding "$3" --xp_reward "$4" >/dev/null
}

# ---------------------------------------------------------------------------

log()  { printf '\n==> %s\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

# Runs a stellar command, or only prints it when DRY_RUN=1. Dry-run lines go
# to fd 3 so that callers silencing stderr do not hide them.
exec 3>&2
sx() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] stellar %s\n' "$*" >&3
    echo "DRY_RUN_VALUE"
    return 0
  fi
  stellar "$@"
}

# Path of the built Wasm for a cargo package name.
wasm_of() {
  local file="$WASM_DIR/$(echo "$1" | tr '-' '_').wasm"
  [ "$DRY_RUN" = 1 ] || [ -f "$file" ] || die "missing $file (did the build of '$1' fail?)"
  echo "$file"
}

package_name() { # dir
  sed -n 's/^name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$1/Cargo.toml" | head -n 1
}

build() { # package
  info "building $1"
  if [ "$DRY_RUN" = 1 ]; then return 0; fi
  stellar contract build --package "$1" --out-dir "$WASM_DIR" >&2
}

ensure_identity() { # name
  if stellar keys address "$1" >/dev/null 2>&1; then
    info "$1 exists, topping up with Friendbot"
    # Friendbot refuses accounts that are already funded; that is fine.
    sx keys fund "$1" --network "$NETWORK" >/dev/null 2>&1 || info "$1 already funded"
  else
    info "generating $1"
    sx keys generate "$1" --network "$NETWORK" --fund >/dev/null
  fi
}

address_of() { # identity
  stellar keys address "$1" 2>/dev/null || echo "DRY_RUN_$1"
}

# --- preflight --------------------------------------------------------------

case "$NETWORK" in
  mainnet|public|pubnet) die "DrainMyWallet is testnet only" ;;
esac
command -v stellar >/dev/null || die "stellar CLI not found (cargo install --locked stellar-cli)"
# Homebrew's rustup is keg-only: its cargo proxy is often missing from PATH.
if ! command -v cargo >/dev/null && [ -x /opt/homebrew/opt/rustup/bin/cargo ]; then
  PATH="/opt/homebrew/opt/rustup/bin:$PATH"
fi
command -v cargo >/dev/null || [ "$DRY_RUN" = 1 ] || die "cargo not found"

# --- 1. identities ----------------------------------------------------------

log "Identities"
ensure_identity "$ADMIN"
ensure_identity "$PLAYER"
ADMIN_ADDR="$(address_of "$ADMIN")"
PLAYER_ADDR="$(address_of "$PLAYER")"
info "admin  $ADMIN_ADDR"
info "player $PLAYER_ADDR"

# --- 2. game token ----------------------------------------------------------

log "Game token $ASSET_CODE (classic asset issued by $ADMIN)"
ASSET="$ASSET_CODE:$ADMIN_ADDR"
# The SAC address is deterministic: deploy it once, reuse it afterwards.
TOKEN_ID="$(sx contract id asset --asset "$ASSET" --network "$NETWORK")"
if [ "$DRY_RUN" != 1 ] && sx contract invoke --id "$TOKEN_ID" --source "$ADMIN" \
    --network "$NETWORK" -- symbol >/dev/null 2>&1; then
  info "SAC already deployed"
else
  TOKEN_ID="$(sx contract asset deploy --asset "$ASSET" --alias dmw-game-token \
    --source "$ADMIN" --network "$NETWORK")"
  info "SAC deployed"
fi
info "SAC $TOKEN_ID"

# The player needs a trustline to keep the loot drained from levels 1 and 3.
sx tx new change-trust --line "$ASSET" --source "$PLAYER" --network "$NETWORK" >/dev/null
info "player trustline set"

# --- 3. build ---------------------------------------------------------------

log "Building Wasm"
build factory
build xp-token
LEVEL_ROWS=""
while read -r id dir xp funding; do
  [ -n "$id" ] || continue
  if [ ! -f "$dir/Cargo.toml" ]; then
    info "level $id: $dir not found, skipped"
    continue
  fi
  pkg="$(package_name "$dir")"
  build "$pkg"
  LEVEL_ROWS="$LEVEL_ROWS$id $pkg $xp $funding
"
done <<EOF
$LEVELS
EOF

# --- 4. factory + XP token --------------------------------------------------

log "Factory"
FACTORY_ID="$(deploy_factory)"
info "factory $FACTORY_ID"

log "XP token (\$DRAIN)"
XP_ID="$(deploy_xp_token)"
info "xp token $XP_ID"
set_xp_token
info "factory.set_xp_token done"

# --- 5. levels --------------------------------------------------------------

log "Levels"
LEVELS_JSON=""
TOTAL_FUNDING=0
while read -r id pkg xp funding; do
  [ -n "$id" ] || continue
  hash="$(sx contract upload --wasm "$(wasm_of "$pkg")" --source "$ADMIN" --network "$NETWORK")"
  funding_units=$((funding * TOKEN_SCALE))
  register_level "$id" "$hash" "$funding_units" "$xp"
  TOTAL_FUNDING=$((TOTAL_FUNDING + funding_units))
  info "level $id ($pkg): hash $hash, funding $funding $ASSET_CODE, $xp XP"
  LEVELS_JSON="$LEVELS_JSON${LEVELS_JSON:+,}
    { \"id\": $id, \"package\": \"$pkg\", \"wasm_hash\": \"$hash\", \"funding\": \"$funding_units\", \"xp_reward\": $xp }"
done <<EOF
$LEVEL_ROWS
EOF
[ -n "$LEVELS_JSON" ] || info "no level found, nothing registered"

# --- 6. provision the factory -----------------------------------------------

log "Provisioning factory"
PROVISION=$((TOTAL_FUNDING * FUND_INSTANCES))
if [ "$PROVISION" -gt 0 ]; then
  # The issuer is the SAC admin, so minting to a contract address needs no trustline.
  sx contract invoke --id "$TOKEN_ID" --source "$ADMIN" --network "$NETWORK" \
    -- mint --to "$FACTORY_ID" --amount "$PROVISION" >/dev/null
  info "minted $((PROVISION / TOKEN_SCALE)) $ASSET_CODE to the factory ($FUND_INSTANCES instances per level)"
else
  info "no funded level, nothing to mint"
fi

# --- 7. record --------------------------------------------------------------

if [ "$DRY_RUN" = 1 ]; then
  log "Dry run complete, $OUT_FILE not written"
  exit 0
fi

mkdir -p "$(dirname "$OUT_FILE")"
cat >"$OUT_FILE" <<EOF
{
  "network": "$NETWORK",
  "admin": "$ADMIN_ADDR",
  "player": "$PLAYER_ADDR",
  "game_token": { "asset": "$ASSET", "sac": "$TOKEN_ID", "decimals": 7 },
  "factory": "$FACTORY_ID",
  "xp_token": "$XP_ID",
  "levels": [$LEVELS_JSON
  ]
}
EOF

log "Done, wrote ${OUT_FILE#"$ROOT"/}"
cat "$OUT_FILE"
