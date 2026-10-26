# DrainMyWallet

**A security wargame for Soroban.** Each level is a deliberately vulnerable smart contract. You deploy your own instance on Stellar **testnet**, exploit it from the command line, then ask the game to verify the win on-chain. Win a level, earn non-transferable `$DRAIN` XP.

> Educational CTF. **Testnet only. No real funds, ever.** The site never signs an exploit for you: it only creates your instance and checks the result.

**Live site: https://drainmywallet.vercel.app** (Stellar testnet)

Built at HackMeridian, Lisbon, 25–26 Oct 2026 (Genesis track).

## The problem

Ethernaut trained a generation of Ethereum developers, but smart contract bugs depend on the execution model, and Soroban is not the EVM. There is no `msg.sender`: authorization goes through `require_auth()` on a specific address. Storage has types and a time-to-live. Rust has its own integer pitfalls. Lessons from Solidity wargames do not transfer, and we found no Soroban equivalent. DrainMyWallet is that training ground.

## What is different on Soroban

Nothing here is a Solidity lesson in disguise. The levels exist because these things work differently on Soroban:

| Concept | On the EVM | On Soroban |
|---------|-----------|------------|
| Who is calling | `msg.sender`, checked for you | No implicit caller: a function must ask a specific address for proof with `require_auth()`, and forgetting it, or asking the wrong address, is a bug |
| Contract state | One storage per contract | Three kinds of storage (temporary, persistent, instance), each with a time-to-live: state can expire |
| Storage keys | Hashed slots | Any value can be a key, so a key chosen by a user can land on one the contract uses for itself |
| Time | `block.timestamp`, `block.number` | Ledger sequence and timestamp are separate values in different units |
| Tokens | Any ERC-20 is just an address | Any address can be a contract written by the caller, and a classic Stellar asset needs a trustline before it can be received |
| Integers | Checked arithmetic by default since 0.8 | Rust: `as` casts truncate silently, signed types let negative amounts through |
| Setup | `constructor` or `initialize`, a classic source of takeover bugs | `__constructor` runs once at deploy time |

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
| 7 | Negative Space | Take the treasury's points for yourself | 150 |
| 8 | Name Clash | Become admin | 350 |
| 9 | Time Warp | Empty a vault that is locked for two months | 350 |

Each level ships with an exploit as a `cargo test` in its own `test` module, so no level can turn out impossible. Write-ups of every exploit (spoilers) live on the [`solutions`](../../tree/solutions) branch, away from `main`.

Level 1 is guided: the page walks you through it in eight steps and notices on its own what you have already done, but you still have to find the bug yourself (a question with graded help, and the attack command stays hidden until you ask for it). Level 6 is the hardest: the exploit is a small contract you write and deploy yourself.

Level 5 depends on time: a temporary storage entry lasts at least 720 ledgers on testnet, about an hour. Create your instance first and come back to it.

## How to play

You need the [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup) and a testnet account:

```bash
stellar keys generate me --network testnet --fund
```

1. **Open the site** and press **Start to drain** (or scroll through the intro first). On the level list, connect a wallet (Freighter or any wallet supported by Stellar Wallets Kit) set to **testnet**, pick a level and click **Create my instance**. The site refuses to run on any other network.
2. **Read the contract** shown on the level page and find the bug.
3. **Exploit it yourself** with the Stellar CLI or a script, signing as your own account:
   ```bash
   stellar contract invoke --id <your-instance> --network testnet --source-account me -- <function> ...
   ```
   Levels 2, 4, 5, 7 and 9 only count what the instance's player does, so `me` must be the account your wallet is connected with: import its secret into the wallet, or add the wallet's secret to the CLI with `stellar keys add me --secret-key`. Use a testnet-only account for this.
4. **Click Check.** The factory calls the level's `is_solved`, and on the first win mints the level's XP to you.

Levels 1, 2, 6 and 9 pay out in `LOOT`, a classic Stellar asset, so your account needs a trustline first or the exploit fails with `Error(Contract, #13)`:

```bash
stellar tx new change-trust --line LOOT:<issuer> --source-account me --network testnet
```

The issuer is in [Deployed contracts](#deployed-contracts). The level page shows this step and detects when the trustline is open. The guided level 1 uses a throwaway `attacker` key for the attack, so your wallet's own key never has to leave the wallet.

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

- **Factory** (`contracts/factory`): `register_level`, `new_instance`, `instance_of`, `submit`, `progress`, plus `player_count`, `players` and `solves` for the leaderboard. Deploys each instance with `env.deployer()` using a salt derived from `(player, level, nonce)`, passes `(player, token)` to the level's `__constructor`, then mints its funding: the factory is the admin of the game asset's SAC, so no amount of fresh instances can run a stock dry. `submit` is idempotent: a solved level never mints twice. It also records the player and the level's solve count on-chain, so the leaderboard never depends on how long an RPC server keeps events.
- **XP token** (`contracts/xp-token`): minimal `$DRAIN` token with `mint`, `balance`, `decimals`, `name` and `symbol`, and deliberately no `transfer`, `transfer_from` or `approve`. Only the factory, fixed at deploy time, can mint.
- **Levels** (`contracts/levels/*`): each implements `__constructor(player, token)` and `is_solved(player) -> bool`, and keeps its state in instance storage. Initialization uses constructors, so no level needs a fragile `setup` guard.
- **Game asset**: `LOOT`, a classic Stellar asset issued by the game admin and used through its Stellar Asset Contract.
- **Frontend** (`app/`, `app-lib/`): React + Vite from [Scaffold Stellar](https://github.com/stellar-scaffold/cli), using Stellar Wallets Kit. Four pages:
  - `/` is a scroll-driven 3D intro built with [three.js](https://threejs.org): a neon wallet pours XLM coins, the camera dives through it and down a tunnel to a vault door that opens onto a room of coins. It is lazy-loaded, pauses off screen, and falls back to plain cards with reduced motion or without WebGL.
  - `/play` is the level list, Root-Me style: each level has a category (Auth, Arithmetic, Storage, Cross-contract, Logic), a difficulty, its XP and how many players have solved it (read from the factory). Filter by category or difficulty, hide solved levels, or sort by level, difficulty, XP or solves.
  - `/level/:id` shows the story, the contract source, a hint, and the instance controls. Level 1 opens with a step-by-step walkthrough that follows the player's progress on-chain (wallet, funded account, instance, and the vault balance polled until it is empty).
  - `/leaderboard` reads the player list from the factory and each player's `$DRAIN` balance.

### Deployed contracts

Stellar **testnet**. Also in [`deployments/testnet.env`](deployments/testnet.env).

| Item | Value |
|------|-------|
| Factory | `CA6L5VQSIYDW6D5WGOPKF3YETYAQVY54KV4XPAQG3JQMB4TLO7XN6YU6` |
| XP token `$DRAIN` | `CAFAPEKDAFXAQGB6HETOMY4TLLK4MP7E2CPYVPPLJR5UBBTUQUHVL7ZG` |
| Game asset | `LOOT:GCXCR447LZZEHQVFQRUTOQSCNU7A25H4JGXSM43W5R3R7KBVAB7UGD2D` |
| Game asset SAC | `CAORXVHOHQA424DCBDILQVASPIF2VKLHMCHV53FBXJH753TZ5Y7KULU7` |
| Level 1 Wasm hash | `cfdcbe9aece7452018f8325a8d5d67e64bdb448c9fe5590d4e033a0c04182295` |
| Level 2 Wasm hash | `8818e2d882fbd130cfdebd84df566323492a9db8b9f4e0e639ccfb830a0a965e` |
| Level 3 Wasm hash | `40d935e48ec216e57214056677692d95e03f79d9c99eec044ab9a1debfb1ca17` |
| Level 4 Wasm hash | `f39265409ce1d03658a2b8809146fcf86c34e2e7a4733b5a2f164dc199e3e913` |
| Level 5 Wasm hash | `19174be6938611f0a95a98105c0ad7553122b9dcf7105221323420318b8bb3a9` |
| Level 6 Wasm hash | `39c531cdca932acb2f550100555ce274e105f3b20edd0b46da136037dd26c78e` |
| Level 7 Wasm hash | `6f402c8852e175e8e8cac6bd32fb7d30bad94657604ed4bf45d4b743d9b1ac38` |
| Level 8 Wasm hash | `02b4af8d0ab567f873cb6c004e244f54421af65ffcb6a8db36a2c827f43fd0fc` |
| Level 9 Wasm hash | `a3533829d4590786475b20c3b7df93eea44e41254852f862a1bced04e728dfbf` |

`scripts/smoke-test.sh` plays the levels end to end on these contracts with a fresh account: create an instance, run the exploit, submit, check that the XP was minted. It passed on levels 1 to 4 and 6 to 9. The account `GAE3GMZYJXZJ2CYL3ZMHXOJOH7CKPFLVPQ42YTON6P6UGCBZ5IZ4EHER` holds the resulting 2,450 `$DRAIN` and can be looked up on [Stellar Expert](https://stellar.expert/explorer/testnet/account/GAE3GMZYJXZJ2CYL3ZMHXOJOH7CKPFLVPQ42YTON6P6UGCBZ5IZ4EHER). Level 5 waits about an hour for the ban to expire, so it runs on its own (`WITH_SLOW=1 ONLY=5`).

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

### Deploying the site (Vercel)

The site is a static single-page app. Vercel cannot build it, because the generated contract clients need Rust and the Stellar CLI, so it is built locally and uploaded as a prebuilt deployment:

```bash
scripts/build-vercel.sh                  # clients + site for testnet, laid out in .vercel/output
npx vercel login                         # once
npx vercel link                          # once, creates or picks the Vercel project
npx vercel git disconnect --yes          # once: `link` also connects the GitHub repo, see below
npx vercel deploy --prebuilt --prod
```

The script reads the factory id from `deployments/testnet.env` and bakes it into the build, so there is nothing to set in the Vercel dashboard. Routes such as `/level/5` are rewritten to `index.html`. Rebuild and redeploy after any contract redeployment.

`vercel link` connects the GitHub repository to the project by default. Vercel would then build the repository on every push, find no site to build (the Stellar CLI is missing) and replace the live deployment with a 404 page. Run `vercel git disconnect` once, as above, so that only `vercel deploy --prebuilt` publishes the site.

### Environment variables

Set in `app/.env` (see `app/.env.example`). Variables prefixed `PUBLIC_` reach the frontend.

| Variable | Purpose |
|----------|---------|
| `STELLAR_NETWORK` | Network from `scaffold.yml` to build for (`testnet`: the game contracts only exist there). |
| `PUBLIC_FACTORY_CONTRACT_ID` | Factory the UI talks to. Without it the UI still renders, with actions disabled. |
| `PUBLIC_XP_CONTRACT_ID` | Optional. Read from `factory.xp_token()` when unset. |
| `PUBLIC_REPO_URL` | Optional. Repository link shown on every page. |

`scripts/deploy.sh` also reads `ASSET_CODE` (default `LOOT`) and `WITH_TEST_LEVEL=1` (also register the `test-level` fixture as level 99, for smoke tests). It hands the game asset's admin role to the new factory: from the issuer on a first deploy, from the previous factory (`set_token_admin`) on a redeploy.

### Repository layout

```
contracts/
├── factory/        deploys instances, verifies wins, mints XP
├── xp-token/       $DRAIN, non-transferable
├── levels/         01-open-door … 09-time-warp
└── test-level/     fixture used only by the factory tests
app/, app-lib/      frontend and wallet helpers (Scaffold Stellar)
scripts/            deploy.sh (game contracts), extend.sh (storage TTLs), build-vercel.sh (site)
deployments/        contract ids per network
```

## Testnet notes

- Storage rent on testnet varies a lot. Player calls never extend TTLs, so entries live for the network minimum (about a week). Run `scripts/extend.sh testnet <admin>` before that runs out, by hand or from a cron job: it extends the contracts, their Wasm, the registered levels and every listed player's progress and `$DRAIN` balance (`LEDGERS`, default about 30 days), paid by the admin.
- Levels hold no real value. The factory mints `LOOT` for each instance, and it is worth nothing.

## What's next

- **Community levels.** `register_level` is a single admin call, so adding a level means writing a crate that implements `__constructor(player, token)` and `is_solved(player)`. Audit firms and Soroban teams could contribute levels drawn from the bugs they find in real code, each with its exploit as a test.
- **A path for new Soroban developers.** The guided first level and the Soroban-versus-EVM table are meant to be linked from onboarding material, as the exercise to do after the getting-started tutorial and before writing a first contract that holds value.
- **More levels, same format.** Candidates: authorization on cross-contract calls, token allowances, storage extension that nobody pays for, and contract upgrades.
- **Measured learning.** The factory already counts solves per level on-chain. Plotting where players get stuck shows which concepts need better teaching.

## Starting point and work done during HackMeridian

The repository started on 25 Oct 2026, the first day of the event, from the [Scaffold Stellar](https://github.com/stellar-scaffold/cli) 0.0.33 React template (commit "Bootstrap project from Scaffold Stellar 0.0.33 React template"). That template is the only existing code: its project structure, wallet connection helpers (`app-lib/env.ts`, `format.ts`, `friendbot.ts`, `wallet.ts`) and base styles. Its `guess-the-number` example contract was kept at first and has since been removed.

Everything below was written during the event:

- all contracts: the factory, the `$DRAIN` token, the nine levels and the test fixture, with an exploit test for every level;
- the on-chain game logic: per-player instances, funding by minting, idempotent XP, the on-chain player list and solve counts;
- the whole game frontend: level list, level pages, guided first level, leaderboard, network guard, attack command blocks, and the 3D intro;
- the scripts: `deploy.sh`, `extend.sh`, `smoke-test.sh`, `build-vercel.sh`;
- the deployment on testnet and on Vercel.

No team member had a prior version of this project.

## AI assistance

Claude (Anthropic) was used through Claude Code to draft the contracts, tests, scripts and frontend, and to write this README. All of it was developed during the event on top of the template described above. The author is expected to review and be able to explain every level.
