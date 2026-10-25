# DrainMyWallet — Project Spec

A security wargame for Soroban. Each level is a deliberately vulnerable contract. The player deploys their own instance on Stellar testnet, exploits it, then asks the game to verify the win on-chain.

> "Ethernaut trained a generation of Ethereum developers. Soroban doesn't play by the same rules, so it needs its own training ground."

- **Event:** HackMeridian, Lisbon, 25–26 Oct 2026
- **Track:** Genesis (developer tool, technical demo allowed by the rules). Closest thematic track: Stellar Unlocked.
- **Network:** Stellar **testnet only**. Never mainnet, never real funds.
- **Submission format:** demo video + public repo. Winners present on stage at Meridian.

---

## 1. Why Soroban

Smart contract bugs depend on the language and execution model. Soroban is not the EVM, so Ethernaut's lessons don't transfer.

- **Gone or different:** `tx.origin`, `delegatecall`, low-level storage tricks. Re-entrancy is believed to be blocked by the Soroban host — **verify in the docs before claiming it anywhere**.
- **New pitfalls:** authorization through `require_auth()` on a specific address instead of `msg.sender`; storage with a time-to-live and three types (temporary, persistent, instance); Rust type conversions and arithmetic.

Existing wargames (Ethernaut, Damn Vulnerable DeFi, Mr Steal Yo Crypto) are all EVM/Solidity. A quick search found no Soroban equivalent — confirm with a mentor on day 1.

---

## 2. Repository layout

```
drainmywallet/
├── SPEC.md
├── README.md
├── contracts/
│   ├── factory/
│   ├── xp-token/                   # $DRAIN, non-transferable XP
│   └── levels/
│       ├── 01-open-door/
│       ├── 02-crown/
│       ├── 03-wrong-signer/
│       ├── 04-fatal-cast/
│       └── 05-forgetful-list/      # bonus, only if time allows
├── scripts/                        # deploy, register levels, fallback manual instancing
└── frontend/
```

Solutions (exploit write-ups and scripts) live on a separate `solutions` branch so `main` doesn't spoil the game. Exploit **tests** stay on `main` but in a clearly named test module.

---

## 3. Levels

Every level has exactly **one** intended vulnerability. Everything else in the contract must be written correctly so players don't stumble on unintended bugs.

The game token is a classic Stellar asset issued by the game admin and used through its **Stellar Asset Contract (SAC)**. In unit tests, register it with the SDK's test helper for Stellar asset contracts.

| # | Name | Vulnerability | Player goal | `is_solved` returns true when |
|---|------|---------------|-------------|-------------------------------|
| 1 | Open Door | `withdraw(to, amount)` never calls `require_auth` | Empty the vault | Vault token balance is 0 |
| 2 | Crown | `initialize(admin)` can be called again | Become admin | Stored admin == player |
| 3 | Wrong Signer | `withdraw_for(caller, account, amount)` authenticates `caller` but debits `account` without checking they match | Move the victim's balance to yourself | Victim's internal balance is 0 |
| 4 | Fatal Cast | `claim_reward(player, amount: i128)` checks `(amount as u32) <= MAX_REWARD` but credits the full `i128` | Credit yourself an absurd balance | Player's internal balance > 1,000,000 |
| 5 | Forgetful List *(bonus)* | Ban list stored in **temporary** storage, which expires | Act while banned | A banned address performed the protected action |

### Level details

**01 — Open Door.** A vault holds 1,000 game tokens. `deposit(from, amount)` is correct. `withdraw(to, amount)` transfers from the vault to `to` with no auth check. Intended lesson: in Soroban, nothing is protected unless you call `require_auth()` on the right address.

**02 — Crown.** The contract stores an `admin`. `initialize(admin)` writes it without checking whether it is already set. `sweep(to)` lets the admin send all vault funds anywhere. Intended lesson: one-time initialization must be enforced explicitly (or use a constructor).

**03 — Wrong Signer.** A tiny internal ledger. The victim account is pre-credited at setup. `withdraw_for(caller, account, amount)` calls `caller.require_auth()` then debits `account`. There is no approval or equality check. Intended lesson: authenticating *someone* is not the same as authenticating *the owner of the funds*.

**04 — Fatal Cast.** `claim_reward(player, amount: i128)` is meant to cap rewards at `MAX_REWARD = 100`. The check casts to `u32` (which silently truncates), but the credit uses the original `i128`. Passing `2^32 + 1` passes the check and credits 4,294,967,297. Intended lesson: `as` casts in Rust truncate silently, regardless of the `overflow-checks` profile setting.

**05 — Forgetful List (bonus).** `ban(addr)` stores the ban in temporary storage with a short TTL. The protected action checks the ban list. Once the entry expires, the banned address passes. Intended lesson: security state must live in persistent storage with managed TTL. **Only build this if** the minimum TTL for temporary entries on testnet lets the expiry happen within a demo-friendly time — check the network config first.

Each level ships with a one or two sentence story shown above the code on the site.

### Loot vs XP

Two separate things, on purpose.

- **Loot** — the game tokens a player drains (levels 1 and 3) stay in their wallet as a visible trophy. They are transferable and **do not count** toward the score.
- **XP (`$DRAIN`)** — minted by the factory when `submit` validates a level. Fixed reward per level, set by difficulty. **Non-transferable.** The leaderboard reads XP balances.

| Level | XP reward |
|-------|-----------|
| 01 Open Door | 100 |
| 02 Crown | 200 |
| 03 Wrong Signer | 300 |
| 04 Fatal Cast | 400 |
| 05 Forgetful List | 500 |

Why XP is not simply "what you drained":
1. Not every level drains tokens (level 2 makes you admin, level 4 inflates an internal balance, level 5 bypasses a ban).
2. Level 4's exploit credits over 4 billion units; counted as XP, it would break the leaderboard forever.
3. A transferable score can be sent between accounts, so players could climb the leaderboard without solving anything. In a security game, that is the first hole a clever player would try.

---

## 4. Contract interfaces

### Common interface (every level)

- `setup(player)` — prepares the instance for this player (funds the vault, creates the victim balance, sets the original admin). Callable **once**, **only by the factory**. This guard must itself be correct — otherwise level 2's bug leaks into every level. Use a constructor instead if the current SDK version supports passing constructor args at deploy time.
- `is_solved(player) -> bool` — read-only check of the win condition.
- Level-specific functions (including the vulnerable one).

### Factory

- `register_level(level_id: u32, wasm_hash: BytesN<32>)` — game admin only.
- `new_instance(player, level_id) -> Address` — `player.require_auth()`, deploys a fresh instance via `env.deployer()` with a salt derived from `(player, level_id, nonce)`, calls `setup`, stores the mapping, returns the address.
- `instance_of(player, level_id) -> Option<Address>`
- `submit(player, level_id) -> bool` — `player.require_auth()`, calls `is_solved` on the player's instance. If true **and the level was not already solved by this player**, records it and mints the level's XP reward to the player through the XP token. Emits an event. A second `submit` on a solved level returns true but mints nothing.
- `progress(player) -> Vec<u32>` — solved level IDs, used by the UI.

### XP token (`$DRAIN`)

A minimal custom Soroban token contract, **without** `transfer`, `transfer_from` or `approve`: a "soulbound" token.

- `mint(to, amount)` — callable **only by the factory** (the factory address is set once at deploy time).
- `balance(id) -> i128`
- `decimals()`, `name()`, `symbol()` — for display in wallets and explorers.

It does not implement the full SEP-41 interface, on purpose, since SEP-41 requires transfers. The leaderboard reads `balance` for each player who has submitted at least once.

**Fallback** if time runs short: drop the token and keep an XP counter inside the factory (`xp(player) -> i128`). Same game effect, nothing visible in the wallet.

The deployer API has changed across `soroban-sdk` versions. Check the current docs for the exact call before writing the factory.

**Fallback** if contract-side deployment blocks: `scripts/` deploys instances manually and the factory only stores the mapping and runs `submit`.

---

## 5. Frontend

Three pages, Freighter wallet, nothing more.

1. **Home** — concept in two sentences, permanent testnet banner, link to the public repo, the player's XP total, list of levels with status (locked / in progress / solved) and XP reward.
2. **Level page** — story, full contract source, XP reward, the player's instance address, buttons **Create my instance** and **Check**, a hint revealed on click.
3. **Leaderboard** — addresses ranked by `$DRAIN` balance.

Player flow: connect Freighter → create instance → write the exploit with the Stellar CLI or a script → come back and click **Check** → screen turns green, XP counter animates up, link to the transaction on the testnet explorer.

**The site never signs an exploit on the player's behalf.** It only creates instances and verifies. Exploitation happens outside, like a real CTF.

Hosting: Vercel or Netlify. Domain `drainmywallet` if available, otherwise the free subdomain.

---

## 6. Trust and safety

A site called "drain my wallet" that asks you to connect your wallet looks exactly like a phishing drainer. Wallet extensions and browsers keep blocklists of drainer domains, and judges will hesitate. The name stays; the site must defuse that reflex immediately.

- [ ] Permanent banner on every page: educational CTF, **testnet only**
- [ ] UI refuses to run if Freighter is not on testnet (check the network passphrase), with a clear message
- [ ] Link to the public GitHub repo at the top of every page
- [ ] No signature requests other than *create instance* and *check*
- [ ] Solutions on a separate branch

---

## 7. Working rules

- **Every level ships with its exploit as a `cargo test`.** A level without a tested exploit can turn out impossible or trivial.
- **Workflow per level:** the contract and its test are written first; then the author reads the contract **without** looking at the test, finds the bug, and exploits it by hand on testnet. The author must be able to explain every level on stage.
- **One vulnerability per level.** Review each contract for unintended bugs before deploying.
- **AI assistance** was used to draft contracts. Check the hackathon rules on disclosure and state it in the README if required.

---

## 8. Build order

Never start a step before the previous one works end to end.

1. Levels 1–3 with exploit tests, running locally.
2. Factory + `submit`, deployed on testnet, with an end-to-end run: create instance → exploit → submit → solved.
3. Frontend: home, level page, Freighter connection, network guard.
4. XP token wired into `submit`, then leaderboard.
5. Level 4.
6. Deliverables: README, architecture section, demo video. **Reserve at least 1h30 for this, no matter what.**
7. Level 5 (bonus).

**Cut order if late:** level 5 → XP token (replace with the factory counter) → leaderboard → level 4. Minimum presentable core = steps 1 and 2 with a single-page UI.

---

## 9. Demo video (under 3 minutes)

1. **0:00–0:10** — the problem in one sentence, then straight to the screen.
2. Show level 1's contract; point at the missing `require_auth`.
3. Create an instance from the site.
4. Run the exploit from the CLI with an account that doesn't own the vault. Vault empties.
5. Click **Check** — screen turns green, +100 XP lands — open the transaction on the testnet explorer.
6. Close on the list of levels and one line on what makes each one Soroban-specific.

No long intro. One full exploit in real time beats a tour of every page.

---

## 10. Deliverables (required by the rules)

- [ ] Public GitHub repo with source code
- [ ] README: summary, problem, setup, environment variables, how to play
- [ ] Architecture overview: deployed contract IDs (factory, XP token, level WASM hashes), game asset and its SAC, integrations
- [ ] Live URL and/or demo video
- [ ] Evidence of on-chain transactions on testnet
- [ ] Prior work disclosure: none, started during the event

---

## 11. Risks to check first

| Item | Why it blocks | Fallback |
|------|---------------|----------|
| Contract-side deployment with `env.deployer()` | One instance per player depends on it | Manual instancing script |
| Re-entrancy behaviour on Soroban | Claimed in the pitch | Drop the claim if not confirmed |
| `setup` guard correctness | A sloppy guard creates an unintended bug in every level | Use constructors if supported |
| Minimum TTL of temporary storage on testnet | Level 5 depends on it | Drop level 5 |
| Double minting on repeated `submit` | Players could farm XP on a solved level | Unit test: second `submit` mints nothing |
| XP token mint guard | If anyone can call `mint`, the leaderboard is meaningless | Unit test: `mint` from a non-factory address fails |
| Custom XP token shown in Freighter | It is not a classic asset, so the wallet may not list it automatically | Show XP on the site; add the token manually in Freighter for the video |

**Ask a mentor on day 1:** does a Soroban security wargame already exist? If yes, position on what it lacks instead of rebuilding it.