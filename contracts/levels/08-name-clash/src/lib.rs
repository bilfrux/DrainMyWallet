#![no_std]
//! Level 08 — Name Clash.
//!
//! The admin runs a small public registry: anyone can register a delegate
//! under a name, and the name resolves to an address.
use soroban_sdk::{Address, Env, Symbol, contract, contractimpl, contracttype, symbol_short};

/// Where the contract keeps its admin.
const ADMIN: Symbol = symbol_short!("admin");

#[contracttype]
enum DataKey {
    Player,
}

#[contract]
pub struct NameClash;

#[contractimpl]
impl NameClash {
    /// The admin starts out as the contract itself, so nobody can act as it.
    /// Level 8 holds no tokens, so `token` is unused.
    pub fn __constructor(env: &Env, player: Address, _token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage()
            .instance()
            .set(&ADMIN, &env.current_contract_address());
    }

    /// Register `who` as the delegate called `name`.
    pub fn add_delegate(env: &Env, caller: Address, name: Symbol, who: Address) {
        caller.require_auth();
        env.storage().instance().set(&name, &who);
    }

    pub fn delegate(env: &Env, name: Symbol) -> Option<Address> {
        env.storage().instance().get(&name)
    }

    pub fn admin(env: &Env) -> Address {
        env.storage().instance().get(&ADMIN).unwrap()
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::admin(env) == player
    }
}

#[cfg(test)]
mod test;
