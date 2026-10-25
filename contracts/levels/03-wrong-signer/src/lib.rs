#![no_std]
//! Level 03 — Wrong Signer.
//!
//! A small internal ledger. A pooled account holds the community's balance,
//! and members can pull funds out of an account they run.
use soroban_sdk::{
    Address, Env, contract, contracterror, contractimpl, contracttype, panic_with_error,
};

/// What the pooled account holds when the level starts.
pub const POOL_BALANCE: i128 = 1_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InsufficientBalance = 2,
}

#[contracttype]
enum DataKey {
    Player,
    Balance(Address),
}

#[contract]
pub struct WrongSigner;

#[contractimpl]
impl WrongSigner {
    /// The pool is the contract's own address: nobody can sign for it.
    /// Level 3 holds no tokens, so `token` is unused.
    pub fn __constructor(env: &Env, player: Address, _token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(
            &DataKey::Balance(env.current_contract_address()),
            &POOL_BALANCE,
        );
    }

    /// Move `amount` from `account` to `caller`.
    pub fn withdraw_for(env: &Env, caller: Address, account: Address, amount: i128) {
        caller.require_auth();
        if amount <= 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }

        let from = Self::balance(env, account.clone());
        if from < amount {
            panic_with_error!(env, Error::InsufficientBalance);
        }
        env.storage()
            .instance()
            .set(&DataKey::Balance(account), &(from - amount));

        let to = Self::balance(env, caller.clone());
        env.storage()
            .instance()
            .set(&DataKey::Balance(caller), &(to + amount));
    }

    pub fn balance(env: &Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::balance(env, env.current_contract_address()) == 0
    }
}

#[cfg(test)]
mod test;
