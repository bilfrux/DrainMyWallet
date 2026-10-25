#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Events as _},
    token::{StellarAssetClient, TokenClient},
};
use xp_token::{XpToken, XpTokenClient as XpClient};

mod test_level {
    soroban_sdk::contractimport!(file = "testdata/test_level.wasm");
}

const FUNDING: i128 = 1_000 * 10_000_000;
const XP: i128 = 100;

struct Game<'a> {
    env: Env,
    admin: Address,
    factory: FactoryClient<'a>,
    token: TokenClient<'a>,
    xp: XpClient<'a>,
}

fn setup<'a>() -> Game<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let asset = env.register_stellar_asset_contract_v2(admin.clone());
    let factory_id = env.register(Factory, (&admin, asset.address()));
    let factory = FactoryClient::new(&env, &factory_id);
    let xp_id = env.register(XpToken, (&factory_id,));
    factory.set_xp_token(&xp_id);

    StellarAssetClient::new(&env, &asset.address()).mint(&factory_id, &(10 * FUNDING));
    let wasm_hash = env.deployer().upload_contract_wasm(test_level::WASM);
    factory.register_level(&1, &wasm_hash, &FUNDING, &XP);

    Game {
        token: TokenClient::new(&env, &asset.address()),
        xp: XpClient::new(&env, &xp_id),
        env,
        admin,
        factory,
    }
}

#[test]
fn new_instance_deploys_and_funds() {
    let g = setup();
    let player = Address::generate(&g.env);

    let instance = g.factory.new_instance(&player, &1);

    assert_eq!(g.factory.instance_of(&player, &1), Some(instance.clone()));
    assert_eq!(g.token.balance(&instance), FUNDING);
    assert_eq!(g.token.balance(&g.factory.address), 9 * FUNDING);
    let level = test_level::Client::new(&g.env, &instance);
    assert_eq!(level.funds(), FUNDING);
    assert!(!level.is_solved(&player));
}

#[test]
fn new_instance_requires_player_auth() {
    let g = setup();
    let player = Address::generate(&g.env);

    g.factory.new_instance(&player, &1);
    let auths = g.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, player);

    g.env.set_auths(&[]);
    assert!(g.factory.try_new_instance(&player, &1).is_err());
}

#[test]
fn new_instance_unknown_level_fails() {
    let g = setup();
    let player = Address::generate(&g.env);
    assert!(g.factory.try_new_instance(&player, &42).is_err());
}

#[test]
fn each_new_instance_gets_a_fresh_address() {
    let g = setup();
    let alice = Address::generate(&g.env);
    let bob = Address::generate(&g.env);

    let a1 = g.factory.new_instance(&alice, &1);
    let a2 = g.factory.new_instance(&alice, &1);
    let b1 = g.factory.new_instance(&bob, &1);

    assert_ne!(a1, a2);
    assert_ne!(a1, b1);
    assert_ne!(a2, b1);
    assert_eq!(g.factory.instance_of(&alice, &1), Some(a2));
}

#[test]
fn submit_unsolved_returns_false_and_mints_nothing() {
    let g = setup();
    let player = Address::generate(&g.env);
    g.factory.new_instance(&player, &1);

    assert!(!g.factory.submit(&player, &1));
    assert_eq!(g.xp.balance(&player), 0);
    assert_eq!(g.factory.progress(&player), Vec::<u32>::new(&g.env));
}

#[test]
fn submit_without_instance_fails() {
    let g = setup();
    let player = Address::generate(&g.env);
    assert!(g.factory.try_submit(&player, &1).is_err());
}

#[test]
fn submit_solved_mints_xp_once() {
    let g = setup();
    let player = Address::generate(&g.env);
    let instance = g.factory.new_instance(&player, &1);
    test_level::Client::new(&g.env, &instance).win();

    assert!(g.factory.submit(&player, &1));
    // Events only cover the last invocation, so check them before any other call.
    let factory_events = g.env.events().all().filter_by_contract(&g.factory.address);
    assert_eq!(factory_events.events().len(), 1);
    assert_eq!(g.xp.balance(&player), XP);
    assert_eq!(g.factory.progress(&player), vec![&g.env, 1u32]);

    // A second submit, even on a brand new unsolved instance, mints nothing.
    assert!(g.factory.submit(&player, &1));
    g.factory.new_instance(&player, &1);
    assert!(g.factory.submit(&player, &1));
    assert_eq!(g.xp.balance(&player), XP);
    assert_eq!(g.factory.progress(&player), vec![&g.env, 1u32]);
}

#[test]
fn submit_requires_player_auth() {
    let g = setup();
    let player = Address::generate(&g.env);
    let instance = g.factory.new_instance(&player, &1);
    test_level::Client::new(&g.env, &instance).win();

    g.env.set_auths(&[]);
    assert!(g.factory.try_submit(&player, &1).is_err());
    assert_eq!(g.xp.balance(&player), 0);
}

#[test]
fn one_players_win_does_not_count_for_another() {
    let g = setup();
    let alice = Address::generate(&g.env);
    let bob = Address::generate(&g.env);
    let instance = g.factory.new_instance(&alice, &1);
    test_level::Client::new(&g.env, &instance).win();
    g.factory.new_instance(&bob, &1);

    assert!(!g.factory.submit(&bob, &1));
    assert!(g.factory.submit(&alice, &1));
    assert_eq!(g.xp.balance(&bob), 0);
    assert_eq!(g.xp.balance(&alice), XP);
}

#[test]
fn only_admin_registers_levels() {
    let g = setup();
    let hash = g.factory.level(&1).unwrap().wasm_hash;

    g.factory.register_level(&2, &hash, &0, &200);
    let auths = g.env.auths();
    assert_eq!(auths[0].0, g.admin);
    assert_eq!(
        auths[0].1.function,
        AuthorizedFunction::Contract((
            g.factory.address.clone(),
            Symbol::new(&g.env, "register_level"),
            (2u32, hash.clone(), 0i128, 200i128).into_val(&g.env),
        ))
    );

    g.env.set_auths(&[]);
    assert!(g.factory.try_register_level(&3, &hash, &0, &300).is_err());
    assert_eq!(g.factory.level(&3), None);
}

#[test]
fn register_level_rejects_bad_config() {
    let g = setup();
    let hash = g.factory.level(&1).unwrap().wasm_hash;
    assert!(g.factory.try_register_level(&2, &hash, &-1, &200).is_err());
    assert!(g.factory.try_register_level(&2, &hash, &0, &0).is_err());
}

#[test]
fn xp_token_can_only_be_set_once() {
    let g = setup();
    let other = Address::generate(&g.env);
    assert!(g.factory.try_set_xp_token(&other).is_err());
    assert_eq!(g.factory.xp_token(), g.xp.address);
}

#[test]
fn xp_token_cannot_be_set_by_non_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let factory = FactoryClient::new(&env, &env.register(Factory, (&admin, &token)));
    let xp = Address::generate(&env);
    assert!(factory.try_set_xp_token(&xp).is_err());
}
