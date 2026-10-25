extern crate std;

use super::{Error, POOL_BALANCE, WrongSigner, WrongSignerClient};
use soroban_sdk::{Address, Env, testutils::Address as _};

fn setup() -> (Env, WrongSignerClient<'static>, Address) {
    let env = Env::default();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let id = env.register(WrongSigner, (&player, &token));
    let client = WrongSignerClient::new(&env, &id);
    (env, client, player)
}

#[test]
fn starts_with_a_funded_pool() {
    let (_env, client, player) = setup();
    assert_eq!(client.balance(&client.address), POOL_BALANCE);
    assert_eq!(client.balance(&player), 0);
    assert!(!client.is_solved(&player));
}

#[test]
fn withdrawing_from_your_own_empty_account_fails() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    assert_eq!(
        client.try_withdraw_for(&player, &player, &1),
        Err(Ok(Error::InsufficientBalance.into()))
    );
}

#[test]
fn withdraw_for_requires_the_callers_signature() {
    let (_env, client, player) = setup();
    assert!(
        client
            .try_withdraw_for(&player, &client.address, &POOL_BALANCE)
            .is_err()
    );
    assert_eq!(client.balance(&client.address), POOL_BALANCE);
}

#[test]
fn invalid_amounts_are_rejected() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    assert_eq!(
        client.try_withdraw_for(&player, &client.address, &0),
        Err(Ok(Error::InvalidAmount.into()))
    );
    assert_eq!(
        client.try_withdraw_for(&player, &client.address, &-5),
        Err(Ok(Error::InvalidAmount.into()))
    );
    assert_eq!(
        client.try_withdraw_for(&player, &client.address, &(POOL_BALANCE + 1)),
        Err(Ok(Error::InsufficientBalance.into()))
    );
}

/// The exploit: sign as yourself, name the pool as the account to debit.
#[test]
fn exploit_debits_the_pool_while_signing_as_the_attacker() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    client.withdraw_for(&player, &client.address, &POOL_BALANCE);

    // The only signature involved is the attacker's own.
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, player);
    assert_eq!(client.balance(&client.address), 0);
    assert_eq!(client.balance(&player), POOL_BALANCE);
    assert!(client.is_solved(&player));
}

#[test]
fn partial_drain_is_not_enough() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    client.withdraw_for(&player, &client.address, &(POOL_BALANCE - 1));
    assert!(!client.is_solved(&player));
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _player) = setup();
    let other = Address::generate(&env);
    env.mock_all_auths();
    client.withdraw_for(&other, &client.address, &POOL_BALANCE);
    assert!(!client.is_solved(&other));
}
