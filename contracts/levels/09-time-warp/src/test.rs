extern crate std;

use super::{Error, TimeWarp, TimeWarpClient};
use soroban_sdk::{
    Address, Env,
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
};

const VAULT: i128 = 1_000 * 10_000_000;

/// The factory deploys at some ledger and a real clock: both values are
/// what the networks report. The timestamp is seconds since 1970.
fn setup() -> (Env, TimeWarpClient<'static>, TokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.sequence_number = 5_400_000;
        l.timestamp = 1_792_000_000;
    });
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(TimeWarp, (&player, &asset.address()));
    StellarAssetClient::new(&env, &asset.address()).mint(&id, &VAULT);
    let client = TimeWarpClient::new(&env, &id);
    let token = TokenClient::new(&env, &asset.address());
    (env, client, token, player)
}

#[test]
fn starts_locked_for_a_million_ledgers() {
    let (_env, client, _token, player) = setup();
    assert_eq!(client.unlock_at(), 5_400_000 + 1_000_000);
    assert_eq!(client.balance(), VAULT);
    assert!(!client.is_solved(&player));
}

/// What the author imagined: with a clock that has not reached the lock, the
/// withdrawal is refused. (Only a timestamp this small ever sees it.)
#[test]
fn the_lock_works_if_the_clock_is_small_enough() {
    let (env, client, _token, player) = setup();
    env.ledger().with_mut(|l| l.timestamp = 1_000);
    assert_eq!(
        client.try_withdraw(&player),
        Err(Ok(Error::StillLocked.into()))
    );
    assert_eq!(client.balance(), VAULT);
}

/// The exploit: just ask. The timestamp (seconds) is compared with a ledger
/// number, and seconds since 1970 are always far larger.
#[test]
fn exploit_withdraw_straight_away() {
    let (_env, client, token, player) = setup();
    client.withdraw(&player);

    assert_eq!(token.balance(&player), VAULT);
    assert_eq!(client.balance(), 0);
    assert!(client.is_solved(&player));
}

#[test]
fn withdraw_requires_the_owners_signature() {
    let (env, client, _token, player) = setup();
    env.set_auths(&[]);
    assert!(client.try_withdraw(&player).is_err());
    assert_eq!(client.balance(), VAULT);
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _token, player) = setup();
    client.withdraw(&player);
    let other = Address::generate(&env);
    assert!(!client.is_solved(&other));
}
