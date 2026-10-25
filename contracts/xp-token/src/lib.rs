#![no_std]
//! $DRAIN: the game's XP. Soulbound on purpose: there is no `transfer`,
//! `transfer_from` or `approve`, so a score can only be earned through the
//! factory, never moved between accounts.
use soroban_sdk::{Address, Env, String, contract, contractevent, contractimpl, contracttype};

#[contracttype]
enum DataKey {
    Factory,
    Balance(Address),
}

/// Balances are bumped to roughly 30 days whenever they drop below ~15 days,
/// so a player's score does not get archived between two sessions.
const DAY_IN_LEDGERS: u32 = 17_280;
const BALANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const BALANCE_THRESHOLD: u32 = BALANCE_BUMP - 15 * DAY_IN_LEDGERS;

#[contractevent(data_format = "single-value")]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct XpToken;

#[contractimpl]
impl XpToken {
    /// The factory is fixed for the token's whole lifetime: it is the only
    /// address that can ever mint.
    pub fn __constructor(env: &Env, factory: Address) {
        env.storage().instance().set(&DataKey::Factory, &factory);
    }

    pub fn mint(env: &Env, to: Address, amount: i128) {
        Self::factory(env).require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let key = DataKey::Balance(to.clone());
        let balance = Self::balance(env, to.clone());
        let new_balance = balance.checked_add(amount).expect("balance overflow");
        env.storage().persistent().set(&key, &new_balance);
        env.storage()
            .persistent()
            .extend_ttl(&key, BALANCE_THRESHOLD, BALANCE_BUMP);
        env.storage()
            .instance()
            .extend_ttl(BALANCE_THRESHOLD, BALANCE_BUMP);
        Mint { to, amount }.publish(env);
    }

    pub fn balance(env: &Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn factory(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Factory)
            .expect("factory not set")
    }

    pub fn decimals(_env: &Env) -> u32 {
        0
    }

    pub fn name(env: &Env) -> String {
        String::from_str(env, "DrainMyWallet XP")
    }

    pub fn symbol(env: &Env) -> String {
        String::from_str(env, "DRAIN")
    }
}

mod test;
