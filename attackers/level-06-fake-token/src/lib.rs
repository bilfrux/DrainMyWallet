#![no_std]
//! Counterfeit token for level 6. It looks like a token to the vault, and its
//! `transfer` does nothing at all.
use soroban_sdk::{Address, Env, contract, contractimpl};

#[contract]
pub struct FakeToken;

#[contractimpl]
impl FakeToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}
