#![no_std]
//! Level 09 — Time Warp.
//!
//! A savings vault locked for about two months. The owner can only withdraw
//! once the lock has run out.
use soroban_sdk::{
    Address, Env, contract, contracterror, contractimpl, contracttype, panic_with_error, token,
};

/// About two months: 1,000,000 ledgers at roughly five seconds each.
pub const LOCK_LEDGERS: u32 = 1_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    StillLocked = 1,
}

#[contracttype]
enum DataKey {
    Player,
    Token,
    UnlockAt,
}

#[contract]
pub struct TimeWarp;

#[contractimpl]
impl TimeWarp {
    pub fn __constructor(env: &Env, player: Address, token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(
            &DataKey::UnlockAt,
            &(env.ledger().sequence() + LOCK_LEDGERS),
        );
    }

    /// Send the whole vault to `to`, once the lock is over. Owner only.
    pub fn withdraw(env: &Env, to: Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner.require_auth();

        let unlock_at: u32 = env.storage().instance().get(&DataKey::UnlockAt).unwrap();
        if env.ledger().timestamp() < unlock_at as u64 {
            panic_with_error!(env, Error::StillLocked);
        }

        let token = Self::token(env);
        let vault = env.current_contract_address();
        token.transfer(&vault, &to, &token.balance(&vault));
    }

    /// The ledger sequence at which the vault unlocks.
    pub fn unlock_at(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::UnlockAt).unwrap()
    }

    pub fn balance(env: &Env) -> i128 {
        Self::token(env).balance(&env.current_contract_address())
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::balance(env) == 0
    }

    fn token(env: &Env) -> token::TokenClient<'_> {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(env, &token)
    }
}

#[cfg(test)]
mod test;
