# DrainMyWallet

**A security wargame for Soroban.** Each level is a deliberately vulnerable smart contract. You deploy your own instance on Stellar **testnet**, exploit it from the command line, then ask the game to verify the win on-chain. Win a level, earn non-transferable `$DRAIN` XP.

> Educational CTF. **Testnet only. No real funds, ever.** The site never signs an exploit for you: it only creates your instance and checks the result.

Built at HackMeridian, Lisbon, 25–26 Oct 2026 (Genesis track).

## The problem

Ethernaut trained a generation of Ethereum developers, but smart contract bugs depend on the execution model, and Soroban is not the EVM. There is no `msg.sender`: authorization goes through `require_auth()` on a specific address. Storage has types and a time-to-live. Rust has its own integer pitfalls. Lessons from Solidity wargames do not transfer, and we found no Soroban equivalent. DrainMyWallet is that training ground.

## Levels

Every level has exactly one intended vulnerability. Finding it is the game, so it is not described here.

| # | Name | Goal | XP |
|---|------|------|----|
| 1 | Open Door | Empty the vault | 100 |
| 2 | Crown | Become admin | 200 |
| 3 | Wrong Signer | Drain the victim's balance into yours | 300 |
| 4 | Fatal Cast | Credit yourself an absurd balance | 400 |
| 5 | Forgetful List | Claim a perk you are banned from | 500 |
| 6 | Counterfeit | Empty the vault (you will need to write a contract) | 600 |

Each level ships with an exploit as a `cargo test` in its own `test` module, so no level can turn out impossible.

Level 6 is the hardest: the exploit is a small contract you write and deploy yourself.

Level 5 depends on time: a temporary storage entry lasts at least 720 ledgers on testnet, about an hour. Create your instance first and come back to it.

## How to play

You need the [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup) and a testnet account:

```bash
stellar keys generate me --network testnet --fund
```

1. **Open the site**, connect a wallet (Freighter or any wallet supported by Stellar Wallets Kit) set to **testnet**, pick a level and click **Create my instance**. The site refuses to run on any other network.
2. **Read the contract** shown on the level page and find the bug.
3. **Exploit it yourself** with the Stellar CLI or a script, signing as your own account:
   ```bash
   stellar contract invoke --id <your-instance> --network testnet --source-account me -- <function> ...
   ```
4. **Click Check.** The factory calls the level's `is_solved`, and on the first win mints the level's XP to you.

Levels 1, 2 and 6 pay out in `LOOT`, a classic Stellar asset, so your account needs a trustline first or the exploit fails with `Error(Contract, #13)`:

```bash
stellar tx new change-trust --line LOOT:<issuer> --source-account me --network testnet
```

The issuer is in [Deployed contracts](#deployed-contracts). The level page shows this step and detects when the trustline is open.

You can create a fresh instance of a level at any time. Solving a level twice mints nothing the second time.

### Loot versus XP

- **Loot** (`LOOT`) is what you drain. It stays in your wallet as a trophy, is transferable and does **not** count for the score.
- **XP (`$DRAIN`)** is minted by the factory when `submit` validates a level, with a fixed reward per level. It has **no transfer function**, so the leaderboard cannot be gamed by sending points between accounts.

## Architecture

```
 player ──new_instance──▶ Factory ──deploy + fund──▶ Level instance (one per player and level)
    │                        │
    │                        └──submit──▶ is_solved(player) ──true──▶ XP token.mint(player)
    └──exploit (CLI, own key)──────────────────────────▶ Level instance
```

- **Factory** (`contracts/factory`): `register_level`, `new_instance`, `instance_of`, `submit`, `progress`. Deploys each instance with `env.deployer()` using a salt derived from `(player, level, nonce)`, passes `(player, token)` to the level's `__constructor`, then funds it with game tokens. `submit` is idempotent: a solved level never mints twice.
- **XP token** (`contracts/xp-token`): minimal `$DRAIN` token with `mint`, `balance`, `decimals`, `name` and `symbol`, and deliberately no `transfer`, `transfer_from` or `approve`. Only the factory, fixed at deploy time, can mint.
- **Levels** (`contracts/levels/*`): each implements `__constructor(player, token)` and `is_solved(player) -> bool`, and keeps its state in instance storage. Initialization uses constructors, so no level needs a fragile `setup` guard.
- **Game asset**: `LOOT`, a classic Stellar asset issued by the game admin and used through its Stellar Asset Contract.
- **Frontend** (`app/`, `app-lib/`): React + Vite from [Scaffold Stellar](https://github.com/stellar-scaffold/cli), using Stellar Wallets Kit. Three pages: home, level, leaderboard. The leaderboard rebuilds the player list from the factory's `level_solved` events and reads each `$DRAIN` balance.

### Deployed contracts

Stellar **testnet**. Also in [`deployments/testnet.env`](deployments/testnet.env).

| Item | Value |
|------|-------|
| Factory | `CAYALJ6CCEM6UEKEQG2SMBLIBBEGTLCXPRQQLV56DETFPFVDXYLB6JDC` |
| XP token `$DRAIN` | `CATI7CZZ7KNF4USZXM4TFVQ3FRXZXQMSRCFTCHOYENYPUSI3Z43EE6SB` |
| Game asset | `LOOT:GCXCR447LZZEHQVFQRUTOQSCNU7A25H4JGXSM43W5R3R7KBVAB7UGD2D` |
| Game asset SAC | `CAORXVHOHQA424DCBDILQVASPIF2VKLHMCHV53FBXJH753TZ5Y7KULU7` |
| Level 1 Wasm hash | `cfdcbe9aece7452018f8325a8d5d67e64bdb448c9fe5590d4e033a0c04182295` |
| Level 2 Wasm hash | `8818e2d882fbd130cfdebd84df566323492a9db8b9f4e0e639ccfb830a0a965e` |
| Level 3 Wasm hash | `40d935e48ec216e57214056677692d95e03f79d9c99eec044ab9a1debfb1ca17` |
| Level 4 Wasm hash | `f39265409ce1d03658a2b8809146fcf86c34e2e7a4733b5a2f164dc199e3e913` |
| Level 5 Wasm hash | `19174be6938611f0a95a98105c0ad7553122b9dcf7105221323420318b8bb3a9` |
| Level 6 Wasm hash | `39c531cdca932acb2f550100555ce274e105f3b20edd0b46da136037dd26c78e` |

All four levels were played end to end on these contracts with a fresh account (create instance, exploit, submit, XP minted once, a second submit mints nothing). The player `GAIX3VXN2IY354E7QCKIWP2IQUCB2QOD6AW6HILXG5SN2EYICNTTSAPM` holds the resulting 1000 `$DRAIN` and can be looked up on [Stellar Expert](https://stellar.expert/explorer/testnet/account/GAIX3VXN2IY354E7QCKIWP2IQUCB2QOD6AW6HILXG5SN2EYICNTTSAPM).

### Trust and safety

A site called "drain my wallet" that asks for a wallet connection looks like a phishing drainer, so the UI defuses that on purpose:

- a permanent banner on every page says it is an educational CTF on testnet only;
- the UI refuses to run if the wallet is not on the testnet passphrase;
- every page links to this repository;
- the only signatures it ever asks for are *create instance* and *check*.

## Setup (run it yourself)

Requirements: Rust (installed through `rustup`, the repo pins 1.93.0 in `rust-toolchain.toml`), the `wasm32v1-none` target (installed automatically by the toolchain file), the [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup), Node.js (24 tested), and Docker only if you want a local network.

```bash
cargo install --locked stellar-scaffold-cli@0.0.33

npm install
cargo test                                           # all contract tests, including every exploit

STELLAR_NETWORK=testnet stellar scaffold build --network testnet   # generates the TypeScript clients
STELLAR_NETWORK=testnet npm run dev                                # frontend on http://localhost:5173
```

Scaffold Stellar does not deploy to shared networks, so the game contracts are deployed by a script:

```bash
scripts/deploy.sh testnet my-admin     # asset + SAC, factory, XP token, every level crate
```

It writes the resulting ids to `deployments/<network>.env`. Put the factory id in `app/.env` and in `scaffold.yml`.

### Environment variables

Set in `app/.env` (see `app/.env.example`). Variables prefixed `PUBLIC_` reach the frontend.

| Variable | Purpose |
|----------|---------|
| `STELLAR_NETWORK` | Network from `scaffold.yml` to build for (`testnet` for the game, `local` for the Scaffold examples). |
| `PUBLIC_FACTORY_CONTRACT_ID` | Factory the UI talks to. Without it the UI still renders, with actions disabled. |
| `PUBLIC_XP_CONTRACT_ID` | Optional. Read from `factory.xp_token()` when unset. |
| `PUBLIC_REPO_URL` | Optional. Repository link shown on every page. |

`scripts/deploy.sh` also reads `ASSET_CODE` (default `LOOT`), `FACTORY_STOCK` (game tokens minted to the factory, in stroops) and `WITH_TEST_LEVEL=1` (also register the `test-level` fixture as level 99, for smoke tests).

### Repository layout

```
contracts/
├── factory/        deploys instances, verifies wins, mints XP
├── xp-token/       $DRAIN, non-transferable
├── levels/         01-open-door, 02-crown, 03-wrong-signer, 04-fatal-cast, 05-forgetful-list, 06-counterfeit
├── test-level/     fixture used only by the factory tests
└── guess-the-number/   Scaffold example, kept as a reference
app/, app-lib/      frontend and wallet helpers (Scaffold Stellar)
scripts/            deploy.sh
deployments/        contract ids per network
```

## Testnet notes

- Storage rent on testnet varies a lot. Player calls never extend TTLs, so entries live for the network minimum (about a week) and a deployment needs extending with `stellar contract extend` if the game must outlive that.
- Levels hold no real value. The factory's `LOOT` stock is minted for the game and worth nothing.

## AI assistance

Claude (Anthropic) was used through Claude Code to draft the contracts, tests, scripts and frontend, and to write this README. All of it was developed during the event, and no prior work was reused. The author is expected to review and be able to explain every level.
