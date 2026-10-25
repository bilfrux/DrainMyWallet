extern crate std;

use super::{OpenDoor, OpenDoorClient};
use soroban_sdk::{
    Address, Env, IntoVal,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
};

/// The funding the factory gives a level 1 instance: 1,000 tokens.
const VAULT: i128 = 1_000 * 10_000_000;

fn setup() -> (Env, OpenDoorClient<'static>, TokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(OpenDoor, (&player, &asset.address()));
    // The factory funds the vault right after deploying it.
    StellarAssetClient::new(&env, &asset.address()).mint(&id, &VAULT);
    // Clear the setup mocks: every test chooses what it authorizes.
    env.set_auths(&[]);
    let client = OpenDoorClient::new(&env, &id);
    let token = TokenClient::new(&env, &asset.address());
    (env, client, token, player)
}

#[test]
fn starts_funded_and_unsolved() {
    let (_env, client, _token, player) = setup();
    assert_eq!(client.balance(), VAULT);
    assert!(!client.is_solved(&player));
}

#[test]
fn deposit_works_for_the_depositor() {
    let (env, client, token, _player) = setup();
    let donor = Address::generate(&env);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &token.address).mint(&donor, &500);
    env.set_auths(&[]);

    env.mock_auths(&[MockAuth {
        address: &donor,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "deposit",
            args: (&donor, 500i128).into_val(&env),
            sub_invokes: &[MockAuthInvoke {
                contract: &token.address,
                fn_name: "transfer",
                args: (&donor, &client.address, 500i128).into_val(&env),
                sub_invokes: &[],
            }],
        },
    }]);
    client.deposit(&donor, &500);
    assert_eq!(client.balance(), VAULT + 500);
}

#[test]
fn deposit_requires_the_depositors_signature() {
    let (env, client, token, _player) = setup();
    let donor = Address::generate(&env);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &token.address).mint(&donor, &500);
    env.set_auths(&[]);

    assert!(client.try_deposit(&donor, &500).is_err());
    assert_eq!(token.balance(&donor), 500);
}

/// The exploit. No signature of any kind is provided: nothing is mocked.
#[test]
fn exploit_empties_the_vault_without_any_auth() {
    let (env, client, token, player) = setup();
    let thief = Address::generate(&env);

    client.withdraw(&thief, &VAULT);

    assert!(env.auths().is_empty());
    assert_eq!(token.balance(&thief), VAULT);
    assert_eq!(client.balance(), 0);
    assert!(client.is_solved(&player));
}

#[test]
fn partial_drain_is_not_enough() {
    let (env, client, _token, player) = setup();
    let thief = Address::generate(&env);

    client.withdraw(&thief, &(VAULT - 1));
    assert!(!client.is_solved(&player));
}

#[test]
fn cannot_withdraw_more_than_the_vault_holds() {
    let (env, client, _token, _player) = setup();
    let thief = Address::generate(&env);
    assert!(client.try_withdraw(&thief, &(VAULT + 1)).is_err());
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _token, _player) = setup();
    let thief = Address::generate(&env);
    client.withdraw(&thief, &VAULT);
    assert!(!client.is_solved(&thief));
}
