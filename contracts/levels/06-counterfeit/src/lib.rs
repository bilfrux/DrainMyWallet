#![no_std]
//! Level 06 — Counterfeit.
//!
//! A vault that keeps an IOU ledger. You deposit tokens to get credit, and
//! withdraw your credit as the game's token.
use soroban_sdk::{Address, Env, contract, contractimpl, contracttype, token};

#[contracttype]
enum DataKey {
    Player,
    /// The game's token, the only one the vault pays out.
    Token,
    Credit(Address),
}

#[contract]
pub struct Counterfeit;

#[contractimpl]
impl Counterfeit {
    pub fn __constructor(env: &Env, player: Address, token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Hand `amount` of `token` to the vault and get the same credit.
    pub fn deposit(env: &Env, token: Address, from: Address, amount: i128) {
        from.require_auth();
        token::TokenClient::new(env, &token).transfer(
            &from,
            env.current_contract_address(),
            &amount,
        );
        let credit = Self::credit(env, from.clone());
        env.storage()
            .instance()
            .set(&DataKey::Credit(from), &(credit + amount));
    }

    /// Cash in `amount` of your credit as the game's token.
    pub fn withdraw(env: &Env, to: Address, amount: i128) {
        to.require_auth();
        let credit = Self::credit(env, to.clone());
        if amount <= 0 || credit < amount {
            panic!("not enough credit");
        }
        env.storage()
            .instance()
            .set(&DataKey::Credit(to.clone()), &(credit - amount));
        Self::game_token(env).transfer(&env.current_contract_address(), &to, &amount);
    }

    pub fn credit(env: &Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Credit(id))
            .unwrap_or(0)
    }

    /// Game tokens currently held by the vault.
    pub fn balance(env: &Env) -> i128 {
        Self::game_token(env).balance(&env.current_contract_address())
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::balance(env) == 0
    }

    fn game_token(env: &Env) -> token::TokenClient<'_> {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(env, &token)
    }
}

#[cfg(test)]
mod test;
