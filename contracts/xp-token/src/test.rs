#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    IntoVal,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
};

fn setup(env: &Env) -> (Address, XpTokenClient<'_>) {
    let factory = Address::generate(env);
    let id = env.register(XpToken, (&factory,));
    (factory, XpTokenClient::new(env, &id))
}

fn mock_mint_by<'a>(
    env: &Env,
    client: &XpTokenClient<'a>,
    signer: &Address,
    to: &Address,
    amount: i128,
) {
    env.mock_auths(&[MockAuth {
        address: signer,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "mint",
            args: (to, amount).into_val(env),
            sub_invokes: &[],
        },
    }]);
}

#[test]
fn metadata() {
    let env = Env::default();
    let (factory, client) = setup(&env);
    assert_eq!(client.factory(), factory);
    assert_eq!(client.decimals(), 0);
    assert_eq!(client.symbol(), String::from_str(&env, "DRAIN"));
    assert_eq!(client.name(), String::from_str(&env, "DrainMyWallet XP"));
}

#[test]
fn factory_can_mint() {
    let env = Env::default();
    let (factory, client) = setup(&env);
    let player = Address::generate(&env);

    mock_mint_by(&env, &client, &factory, &player, 100);
    client.mint(&player, &100);
    mock_mint_by(&env, &client, &factory, &player, 200);
    client.mint(&player, &200);

    assert_eq!(client.balance(&player), 300);
}

#[test]
fn mint_from_non_factory_fails() {
    let env = Env::default();
    let (_factory, client) = setup(&env);
    let player = Address::generate(&env);

    // The player signing for themselves is not enough.
    mock_mint_by(&env, &client, &player, &player, 1_000);
    assert!(client.try_mint(&player, &1_000).is_err());

    // Nor is no signature at all.
    env.set_auths(&[]);
    assert!(client.try_mint(&player, &1_000).is_err());

    assert_eq!(client.balance(&player), 0);
}

#[test]
fn mint_rejects_non_positive_amounts() {
    let env = Env::default();
    let (factory, client) = setup(&env);
    let player = Address::generate(&env);

    mock_mint_by(&env, &client, &factory, &player, 0);
    assert!(client.try_mint(&player, &0).is_err());
    mock_mint_by(&env, &client, &factory, &player, -5);
    assert!(client.try_mint(&player, &-5).is_err());
}
