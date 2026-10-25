#![no_std]
//! Level 05 — Forgetful List.
//!
//! A members-only perk. Moderators ban abusive addresses, and the perk checks
//! the ban list before paying out.
use soroban_sdk::{
    Address, Env, contract, contracterror, contractimpl, contracttype, panic_with_error,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Banned = 1,
    AlreadyClaimed = 2,
}

#[contracttype]
enum DataKey {
    Player,
    Claimed(Address),
    Ban(Address),
}

#[contract]
pub struct ForgetfulList;

#[contractimpl]
impl ForgetfulList {
    /// Starts with the player already banned. Level 5 holds no tokens, so
    /// `token` is unused.
    pub fn __constructor(env: &Env, player: Address, _token: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        Self::ban(env, &player);
    }

    /// Claim the perk. Banned addresses are turned away.
    pub fn claim(env: &Env, member: Address) {
        member.require_auth();
        if Self::is_banned(env, member.clone()) {
            panic_with_error!(env, Error::Banned);
        }
        let key = DataKey::Claimed(member);
        if env.storage().instance().has(&key) {
            panic_with_error!(env, Error::AlreadyClaimed);
        }
        env.storage().instance().set(&key, &true);
    }

    pub fn is_banned(env: &Env, member: Address) -> bool {
        env.storage().temporary().has(&DataKey::Ban(member))
    }

    pub fn has_claimed(env: &Env, member: Address) -> bool {
        env.storage().instance().has(&DataKey::Claimed(member))
    }

    pub fn is_solved(env: &Env, player: Address) -> bool {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        owner == player && Self::has_claimed(env, player)
    }

    /// Put `member` on the ban list. The entry keeps the network's minimum
    /// temporary TTL.
    fn ban(env: &Env, member: &Address) {
        env.storage()
            .temporary()
            .set(&DataKey::Ban(member.clone()), &true);
    }
}

#[cfg(test)]
mod test;
