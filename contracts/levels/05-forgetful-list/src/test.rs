extern crate std;

use super::{Error, ForgetfulList, ForgetfulListClient};
use soroban_sdk::{Address, Env, testutils::Address as _, testutils::Ledger as _};

/// What the real networks guarantee a new temporary entry: 720 ledgers.
const MIN_TEMPORARY_TTL: u32 = 720;

fn setup() -> (Env, ForgetfulListClient<'static>, Address) {
    let env = Env::default();
    env.ledger().with_mut(|l| {
        l.min_temp_entry_ttl = MIN_TEMPORARY_TTL;
        l.sequence_number = 1_000;
        // Keep the instance entry alive across the jump the exploit makes.
        l.min_persistent_entry_ttl = 100_000;
    });
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let id = env.register(ForgetfulList, (&player, &token));
    let client = ForgetfulListClient::new(&env, &id);
    (env, client, player)
}

fn advance(env: &Env, ledgers: u32) {
    env.ledger().with_mut(|l| l.sequence_number += ledgers);
}

#[test]
fn player_starts_banned_and_unsolved() {
    let (_env, client, player) = setup();
    assert!(client.is_banned(&player));
    assert!(!client.has_claimed(&player));
    assert!(!client.is_solved(&player));
}

#[test]
fn banned_member_is_turned_away() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    assert_eq!(client.try_claim(&player), Err(Ok(Error::Banned.into())));
    assert!(!client.is_solved(&player));
}

#[test]
fn the_ban_still_holds_just_before_it_expires() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    advance(&env, MIN_TEMPORARY_TTL - 2);
    assert!(client.is_banned(&player));
    assert!(client.try_claim(&player).is_err());
}

/// The exploit: do nothing, wait for the ban entry to expire, then claim.
#[test]
fn exploit_wait_for_the_ban_to_expire() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    advance(&env, MIN_TEMPORARY_TTL + 1);
    assert!(!client.is_banned(&player));

    client.claim(&player);
    assert!(client.has_claimed(&player));
    assert!(client.is_solved(&player));
}

#[test]
fn claim_requires_the_members_signature() {
    let (env, client, player) = setup();
    advance(&env, MIN_TEMPORARY_TTL + 1);
    assert!(client.try_claim(&player).is_err());
    assert!(!client.is_solved(&player));
}

#[test]
fn a_member_can_only_claim_once() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    advance(&env, MIN_TEMPORARY_TTL + 1);
    client.claim(&player);
    assert_eq!(
        client.try_claim(&player),
        Err(Ok(Error::AlreadyClaimed.into()))
    );
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _player) = setup();
    env.mock_all_auths();
    let other = Address::generate(&env);
    client.claim(&other);
    assert!(!client.is_solved(&other));
}
