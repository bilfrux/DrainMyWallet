#![no_std]
//! Level 01 — Open Door.
//!
//! A community vault holds the game's tokens. Anyone can top it up, and the
//! treasurer sends funds out when the community votes for it.
use soroban_sdk::{Address, Env, contract, contractimpl, contracttype, token};

#[contracttype]
enum DataKey {
    Player,
    Token,
}

#[contract]
pub struct OpenDoor;

#[contractimpl]
impl OpenDoor {
    pub fn __constructor(env: &Env, player: Address, token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Add `amount` tokens from `from` to the vault.
    pub fn deposit(env: &Env, from: Address, amount: i128) {
        from.require_auth();
        Self::token(env).transfer(&from, env.current_contract_address(), &amount);
    }

    /// Send `amount` tokens from the vault to `to`.
    pub fn withdraw(env: &Env, to: Address, amount: i128) {
        Self::token(env).transfer(&env.current_contract_address(), &to, &amount);
    }

    /// Tokens currently held by the vault.
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
