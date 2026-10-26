#!/usr/bin/env bash
# Keeps a deployed game alive. Player calls never extend TTLs (see the factory),
# so everything lives for the network's minimum persistent TTL, about a week on
# testnet. Run this from the admin's account, by hand or from a cron job, well
# before that runs out:
#
#   scripts/extend.sh [network] [admin-identity]
#   LEDGERS=1000000 scripts/extend.sh testnet drain-admin
#
# Extends: the factory, XP token and game asset instances, every Wasm recorded
# in deployments/<network>.env, each registered level, and for every player
# listed by the factory their progress, their place in the list and their
# $DRAIN balance. The admin pays the rent.
set -euo pipefail

NETWORK="${1:-testnet}"
ADMIN="${2:-drain-admin}"
# About 30 days at five seconds a ledger
LEDGERS="${LEDGERS:-518400}"
# Keys sent per transaction, well under the network's footprint limit
CHUNK=20

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deployments/$NETWORK.env"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE: run scripts/deploy.sh $NETWORK first" >&2; exit 1; }
# The env file defines ADMIN too (the admin's address): keep the identity name
SIGNER="$ADMIN"
# shellcheck disable=SC1090
source "$ENV_FILE"

net() { echo "--network $NETWORK --source-account $SIGNER"; }
log() { printf '\n==> %s\n' "$*"; }

extend() { # contract-id [key-xdr...]
  local id="$1"
  shift
  local args=()
  for key in "$@"; do args+=(--key-xdr "$key"); done
  stellar contract extend --id "$id" ${args[@]+"${args[@]}"} \
    --ledgers-to-extend "$LEDGERS" --ttl-ledger-only $(net) >/dev/null
}

extend_keys() { # contract-id key-xdr... (sent in chunks)
  local id="$1"
  shift
  while (($# > 0)); do
    local n=$(($# < CHUNK ? $# : CHUNK))
    extend "$id" "${@:1:n}"
    shift "$n"
  done
}

# Storage keys as the contracts encode them: a `#[contracttype]` enum variant
# is a vector of its name and its fields.
# The JSON is built with printf: macOS bash 3.2 mangles braces inside a quoted
# argument nested in `$(...)`.
key_u32() { # variant number
  printf '{"vec":[{"symbol":"%s"},{"u32":%s}]}' "$1" "$2" | stellar xdr encode --type ScVal
}
key_address() { # variant address
  printf '{"vec":[{"symbol":"%s"},{"address":"%s"}]}' "$1" "$2" | stellar xdr encode --type ScVal
}

log "Contract instances ($LEDGERS ledgers)"
for id in "$FACTORY_ID" "$XP_TOKEN_ID" "$GAME_TOKEN_ID"; do
  extend "$id"
  echo "instance $id"
done

log "Wasm"
for var in $(compgen -v | grep '_WASM_HASH$'); do
  stellar contract extend --wasm-hash "${!var}" \
    --ledgers-to-extend "$LEDGERS" --ttl-ledger-only $(net) >/dev/null
  echo "$var ${!var}"
done
[[ -n "${FACTORY_WASM_HASH:-}" ]] ||
  echo "note: no FACTORY_WASM_HASH in $ENV_FILE, redeploy with the current scripts/deploy.sh to record it"

log "Registered levels"
level_keys=()
for var in $(compgen -v | grep '^LEVEL_[0-9]*_WASM_HASH$'); do
  id="${var#LEVEL_}"
  id="${id%_WASM_HASH}"
  level_keys+=("$(key_u32 Level "$id")")
done
extend_keys "$FACTORY_ID" ${level_keys[@]+"${level_keys[@]}"}
echo "${#level_keys[@]} levels"

log "Players"
if ! count="$(stellar contract invoke --id "$FACTORY_ID" $(net) -- player_count 2>/dev/null)"; then
  echo "this factory predates the player list: player entries skipped"
  exit 0
fi
factory_keys=()
xp_keys=()
for ((start = 0; start < count; start += 50)); do
  page="$(stellar contract invoke --id "$FACTORY_ID" $(net) -- players --start "$start" --limit 50)"
  i="$start"
  for player in $(echo "$page" | grep -oE '[GC][A-Z2-7]{55}'); do
    factory_keys+=(
      "$(key_address Progress "$player")"
      "$(key_u32 Player "$i")"
    )
    xp_keys+=("$(key_address Balance "$player")")
    i=$((i + 1))
  done
done
if ((count > 0)); then
  extend_keys "$FACTORY_ID" ${factory_keys[@]+"${factory_keys[@]}"}
  extend_keys "$XP_TOKEN_ID" ${xp_keys[@]+"${xp_keys[@]}"}
fi
echo "$count players"

log "Done"
