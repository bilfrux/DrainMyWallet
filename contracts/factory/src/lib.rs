#![no_std]
//! DrainMyWallet factory. Deploys one fresh instance of a level per player,
//! funds it with game tokens, checks wins through the level's `is_solved`, and
//! mints $DRAIN XP the first time a player solves a level.
//!
//! Every level must expose:
//! - `__constructor(env, player: Address, token: Address)`
//! - `is_solved(env, player: Address) -> bool`
use soroban_sdk::{
    Address, Bytes, BytesN, ContractExecutable, Env, IntoVal, Symbol, Vec, contract,
    contractclient, contractevent, contractimpl, contracttype, symbol_short, token, vec,
    xdr::ToXdr,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Level {
    pub wasm_hash: BytesN<32>,
    /// Game tokens (in stroops) sent to each new instance.
    pub funding: i128,
    /// $DRAIN minted the first time a player solves the level.
    pub xp_reward: i128,
}

/// A player's current instance of a level. `nonce` counts the instances
/// deployed so far, so the next one gets a fresh salt.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct PlayerInstance {
    address: Address,
    nonce: u32,
}

// Storage writes are rent paid by the player, so player calls never extend
// TTLs: entries live for the network's minimum persistent TTL (about a week
// on testnet), and anyone can extend them with `stellar contract extend`.
// Extending the instance from here would also extend the factory's Wasm,
// which costs thousands of testnet XLM per call.
#[contracttype]
enum DataKey {
    Admin,
    Token,
    XpToken,
    Level(u32),
    Instance(Address, u32),
    Progress(Address),
}

const IS_SOLVED: Symbol = symbol_short!("is_solved");

#[contractclient(name = "XpTokenClient")]
pub trait XpTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
}

#[contractevent]
pub struct InstanceCreated {
    #[topic]
    pub player: Address,
    #[topic]
    pub level_id: u32,
    pub instance: Address,
}

#[contractevent]
pub struct LevelSolved {
    #[topic]
    pub player: Address,
    #[topic]
    pub level_id: u32,
    pub xp_reward: i128,
}

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    /// `token` is the game asset's Stellar Asset Contract. The factory must
    /// hold enough of it to fund new instances.
    pub fn __constructor(env: &Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Wires the XP token. The token is deployed after the factory, since it
    /// takes the factory's address in its own constructor, so this can only
    /// happen once.
    pub fn set_xp_token(env: &Env, xp_token: Address) {
        Self::admin(env).require_auth();
        if env.storage().instance().has(&DataKey::XpToken) {
            panic!("xp token already set");
        }
        env.storage().instance().set(&DataKey::XpToken, &xp_token);
    }

    pub fn register_level(
        env: &Env,
        level_id: u32,
        wasm_hash: BytesN<32>,
        funding: i128,
        xp_reward: i128,
    ) {
        Self::admin(env).require_auth();
        if funding < 0 || xp_reward <= 0 {
            panic!("invalid level config");
        }
        let level = Level {
            wasm_hash,
            funding,
            xp_reward,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Level(level_id), &level);
    }

    /// Deploys a fresh instance of `level_id` for `player`, funds it and
    /// returns its address. Calling it again gives the player a new, clean
    /// instance; the previous one is forgotten.
    pub fn new_instance(env: &Env, player: Address, level_id: u32) -> Address {
        player.require_auth();
        let level = Self::level(env, level_id).expect("unknown level");

        let instance_key = DataKey::Instance(player.clone(), level_id);
        let nonce = env
            .storage()
            .persistent()
            .get::<_, PlayerInstance>(&instance_key)
            .map_or(0, |current| current.nonce);
        let salt = Self::salt(env, &player, level_id, nonce);

        let token = Self::token(env);
        let instance = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_contract(
                ContractExecutable::Wasm(level.wasm_hash),
                (player.clone(), token.clone()),
            );

        if level.funding > 0 {
            token::TokenClient::new(env, &token).transfer(
                &env.current_contract_address(),
                &instance,
                &level.funding,
            );
        }

        let current = PlayerInstance {
            address: instance.clone(),
            nonce: nonce + 1,
        };
        env.storage().persistent().set(&instance_key, &current);

        InstanceCreated {
            player,
            level_id,
            instance: instance.clone(),
        }
        .publish(env);
        instance
    }

    pub fn instance_of(env: &Env, player: Address, level_id: u32) -> Option<Address> {
        env.storage()
            .persistent()
            .get::<_, PlayerInstance>(&DataKey::Instance(player, level_id))
            .map(|current| current.address)
    }

    /// Checks the player's instance. The first win records the level and
    /// mints its XP; later calls return true without minting again.
    pub fn submit(env: &Env, player: Address, level_id: u32) -> bool {
        player.require_auth();
        let mut progress = Self::progress(env, player.clone());
        if progress.contains(level_id) {
            return true;
        }

        let level = Self::level(env, level_id).expect("unknown level");
        let instance = Self::instance_of(env, player.clone(), level_id).expect("no instance");
        let solved: bool =
            env.invoke_contract(&instance, &IS_SOLVED, vec![env, player.into_val(env)]);
        if !solved {
            return false;
        }

        progress.push_back(level_id);
        env.storage()
            .persistent()
            .set(&DataKey::Progress(player.clone()), &progress);

        XpTokenClient::new(env, &Self::xp_token(env)).mint(&player, &level.xp_reward);

        LevelSolved {
            player,
            level_id,
            xp_reward: level.xp_reward,
        }
        .publish(env);
        true
    }

    /// Solved level ids, in the order they were solved.
    pub fn progress(env: &Env, player: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::Progress(player))
            .unwrap_or(Vec::new(env))
    }

    pub fn level(env: &Env, level_id: u32) -> Option<Level> {
        env.storage().persistent().get(&DataKey::Level(level_id))
    }

    pub fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }

    pub fn xp_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::XpToken)
            .expect("xp token not set")
    }
}

impl Factory {
    /// sha256(player || level_id || nonce): unique per player, level and
    /// attempt, so each `new_instance` deploys to a new address.
    fn salt(env: &Env, player: &Address, level_id: u32, nonce: u32) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.append(&player.clone().to_xdr(env));
        data.extend_from_array(&level_id.to_be_bytes());
        data.extend_from_array(&nonce.to_be_bytes());
        env.crypto().sha256(&data).to_bytes()
    }
}

mod test;
