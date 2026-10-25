#![no_std]
//! Level 07 — Negative Space.
//!
//! A tiny internal ledger: accounts hold points and can send them to each
//! other. A treasury account is pre-funded when the level starts.
use soroban_sdk::{
    Address, Env, contract, contracterror, contractimpl, contracttype, panic_with_error,
};

/// What the treasury holds when the level starts.
pub const TREASURY_BALANCE: i128 = 1_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientBalance = 1,
    Overflow = 2,
}

#[contracttype]
enum DataKey {
    Player,
    Balance(Address),
}

#[contract]
pub struct NegativeSpace;

#[contractimpl]
impl NegativeSpace {
    /// The treasury is the contract's own address: nobody can sign for it.
    /// Level 7 holds no tokens, so `token` is unused.
    pub fn __constructor(env: &Env, player: Address, _token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(
            &DataKey::Balance(env.current_contract_address()),
            &TREASURY_BALANCE,
        );
    }

    /// Send `amount` points from `from` to `to`.
    pub fn send(env: &Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance = Self::balance(env, from.clone());
        if from_balance < amount {
            panic_with_error!(env, Error::InsufficientBalance);
        }
        Self::set(env, from, from_balance - amount);

        let to_balance = Self::balance(env, to.clone());
        let credited = to_balance
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
        Self::set(env, to, credited);
    }

    pub fn balance(env: &Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::balance(env, player) >= TREASURY_BALANCE
    }

    fn set(env: &Env, id: Address, value: i128) {
        env.storage().instance().set(&DataKey::Balance(id), &value);
    }
}

#[cfg(test)]
mod test;
