#![no_std]
//! Level 04 — Fatal Cast.
//!
//! A loyalty program pays every address a one-time reward, capped at
//! `MAX_REWARD` points. Points live in an internal ledger.
use soroban_sdk::{
    Address, Env, contract, contracterror, contractimpl, contracttype, panic_with_error,
};

/// Largest reward a single claim may grant.
pub const MAX_REWARD: u32 = 100;

/// Balance the player must exceed for the level to count as solved.
pub const WIN_THRESHOLD: i128 = 1_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    RewardTooLarge = 2,
    AlreadyClaimed = 3,
}

#[contracttype]
enum DataKey {
    Player,
    Balance(Address),
    Claimed(Address),
}

#[contract]
pub struct FatalCast;

#[contractimpl]
impl FatalCast {
    /// Runs once at deploy time. Level 4 holds no tokens, so `token` is unused.
    pub fn __constructor(env: &Env, player: Address, _token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
    }

    /// Claim a one-time reward of at most `MAX_REWARD` points.
    pub fn claim_reward(env: &Env, player: Address, amount: i128) {
        player.require_auth();

        if amount <= 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }
        if (amount as u32) > MAX_REWARD {
            panic_with_error!(env, Error::RewardTooLarge);
        }

        let claimed_key = DataKey::Claimed(player.clone());
        if env.storage().instance().has(&claimed_key) {
            panic_with_error!(env, Error::AlreadyClaimed);
        }
        env.storage().instance().set(&claimed_key, &true);

        let balance_key = DataKey::Balance(player);
        let balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0);
        env.storage().instance().set(&balance_key, &(balance + amount));
    }

    /// Points held by `id` in the internal ledger.
    pub fn balance(env: &Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::balance(env, player) > WIN_THRESHOLD
    }
}

#[cfg(test)]
mod test;
