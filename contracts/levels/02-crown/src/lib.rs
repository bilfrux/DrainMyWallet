#![no_std]
//! Level 02 — Crown.
//!
//! The vault belongs to its admin, who alone can sweep the funds out. The
//! admin is set once, when the vault is initialized.
use soroban_sdk::{Address, Env, contract, contractimpl, contracttype, token};

#[contracttype]
enum DataKey {
    Player,
    Token,
    Admin,
}

#[contract]
pub struct Crown;

#[contractimpl]
impl Crown {
    /// The vault starts out owned by itself, so nobody can sweep it yet.
    pub fn __constructor(env: &Env, player: Address, token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::Admin, &env.current_contract_address());
    }

    /// Hand the vault to `admin`.
    pub fn initialize(env: &Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Send every token in the vault to `to`. Admin only.
    pub fn sweep(env: &Env, to: Address) {
        Self::admin(env).require_auth();
        let token = Self::token(env);
        let vault = env.current_contract_address();
        token.transfer(&vault, &to, &token.balance(&vault));
    }

    pub fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn balance(env: &Env) -> i128 {
        Self::token(env).balance(&env.current_contract_address())
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::admin(env) == player
    }

    fn token(env: &Env) -> token::TokenClient<'_> {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(env, &token)
    }
}

#[cfg(test)]
mod test;
