#![no_std]
//! Minimal level implementing the common level interface, used only by the
//! factory tests. `win` stands in for an exploit.
use soroban_sdk::{Address, Env, contract, contractimpl, contracttype, token};

#[contracttype]
enum DataKey {
    Player,
    Token,
    Won,
}

#[contract]
pub struct TestLevel;

#[contractimpl]
impl TestLevel {
    pub fn __constructor(env: &Env, player: Address, token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    pub fn win(env: &Env) {
        env.storage().instance().set(&DataKey::Won, &true);
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        let won = env.storage().instance().get(&DataKey::Won).unwrap_or(false);
        won && owner == player
    }

    pub fn funds(env: &Env) -> i128 {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(env, &token).balance(&env.current_contract_address())
    }
}
