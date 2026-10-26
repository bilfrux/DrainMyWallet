import { Asset, contract, Keypair, rpc, xdr } from "@stellar/stellar-sdk"
import { allowHttp, networkPassphrase, rpcUrl, stellarNetwork } from "./env"
import { signTransaction } from "./wallet"

/**
 * DrainMyWallet chain access: the factory (instances + submit) and the $DRAIN
 * XP token. Clients are built from the on-chain contract spec with
 * `contract.Client.from`, so the UI works before `stellar scaffold` has
 * generated bindings for these contracts — only their IDs are needed.
 *
 * Set them in `app/.env`:
 *   PUBLIC_FACTORY_CONTRACT_ID=C...
 *   PUBLIC_XP_CONTRACT_ID=C...   (optional: asked from the factory otherwise)
 */
export const factoryContractId = (
	import.meta.env.PUBLIC_FACTORY_CONTRACT_ID as string | undefined
)?.trim()
export const xpContractId = (
	import.meta.env.PUBLIC_XP_CONTRACT_ID as string | undefined
)?.trim()

/** The game refuses to touch mainnet, whatever the build was configured for. */
export const isSafeNetwork = stellarNetwork !== "PUBLIC"

const server = new rpc.Server(rpcUrl, { allowHttp })

/** Contract methods as `contract.Client.from` exposes them. */
type Call<A, R> = (args: A) => Promise<contract.AssembledTransaction<R>>

interface FactoryClient {
	new_instance: Call<{ player: string; level_id: number }, string>
	instance_of: Call<{ player: string; level_id: number }, string | undefined>
	submit: Call<{ player: string; level_id: number }, boolean>
	progress: Call<{ player: string }, number[]>
	player_count: Call<Record<string, never>, number>
	players: Call<{ start: number; limit: number }, string[]>
	solves: Call<{ level_id: number }, number>
	xp_token: Call<Record<string, never>, string>
	level: Call<{ level_id: number }, LevelConfig | undefined>
	token: Call<Record<string, never>, string>
}

/** The Stellar Asset Contract of the LOOT game token. */
interface SacClient {
	name: Call<Record<string, never>, string>
}

/** A level as registered in the factory (None until registered). */
export interface LevelConfig {
	wasm_hash: Uint8Array
	funding: bigint
	xp_reward: bigint
}

interface XpClient {
	balance: Call<{ id: string }, bigint>
}

const clients = new Map<string, Promise<unknown>>()

/** One client per (contract, signer) pair; read-only calls use no signer. */
const getClient = <T>(contractId: string, publicKey?: string): Promise<T> => {
	const key = `${contractId}:${publicKey ?? ""}`
	let client = clients.get(key)
	if (!client) {
		client = contract.Client.from<T>({
			contractId,
			networkPassphrase,
			rpcUrl,
			allowHttp,
			publicKey,
		})
		// Don't cache a failure (e.g. RPC hiccup): retry on next call
		client.catch(() => clients.delete(key))
		clients.set(key, client)
	}
	return client as Promise<T>
}

const requireFactory = () => {
	if (!factoryContractId) throw new Error("Factory contract not configured")
	return factoryContractId
}

/** Contracts may return `Result<T, E>`; unwrap it so callers get plain `T`. */
const unwrap = <T>(value: unknown): T => {
	if (
		value !== null &&
		typeof value === "object" &&
		"unwrap" in value &&
		typeof value.unwrap === "function"
	) {
		return (value as { unwrap: () => T }).unwrap()
	}
	return value as T
}

const factory = (publicKey?: string) =>
	getClient<FactoryClient>(requireFactory(), publicKey)

export interface TxOutcome<T> {
	result: T
	txHash?: string
}

const send = async <T>(
	tx: contract.AssembledTransaction<T>,
): Promise<TxOutcome<T>> => {
	const sent = await tx.signAndSend({ signTransaction })
	return {
		result: unwrap<T>(sent.result),
		txHash: sent.sendTransactionResponse?.hash,
	}
}

/** Level IDs this player has solved. */
export const fetchProgress = async (player: string): Promise<number[]> => {
	const tx = await (await factory()).progress({ player })
	return unwrap<number[]>(tx.result).map(Number)
}

/** XP reward of each registered level; unregistered levels are left out. */
export const fetchRegisteredLevels = async (
	levelIds: number[],
): Promise<Map<number, bigint>> => {
	const client = await factory()
	const entries = await Promise.all(
		levelIds.map(async (id) => {
			const tx = await client.level({ level_id: id })
			const config = unwrap<LevelConfig | undefined>(tx.result)
			return config ? ([id, BigInt(config.xp_reward)] as const) : undefined
		}),
	)
	return new Map(entries.filter((e) => e !== undefined))
}

/** The player's instance of a level, if they deployed one. */
export const fetchInstance = async (
	player: string,
	levelId: number,
): Promise<string | undefined> => {
	const tx = await (await factory()).instance_of({ player, level_id: levelId })
	return unwrap<string | undefined>(tx.result) ?? undefined
}

/** Deploy a fresh instance of a level for the player (signs once). */
export const createInstance = async (
	player: string,
	levelId: number,
): Promise<TxOutcome<string>> => {
	const tx = await (
		await factory(player)
	).new_instance({
		player,
		level_id: levelId,
	})
	return send(tx)
}

/** Ask the factory to verify the win on-chain and mint XP (signs once). */
export const submitLevel = async (
	player: string,
	levelId: number,
): Promise<TxOutcome<boolean>> => {
	const client = await factory(player)
	// Already solved: the factory would only answer true again, so skip the
	// signature for a transaction that changes nothing
	if ((await fetchProgress(player)).includes(levelId)) return { result: true }
	const tx = await client.submit({ player, level_id: levelId })
	// Not solved yet: the simulation already says so, no need to bother the
	// wallet for a signature that would only record `false`.
	if (!unwrap<boolean>(tx.result)) return { result: false }
	return send(tx)
}

let xpTokenId: Promise<string> | undefined

/** The $DRAIN contract: from the env, else asked from the factory once. */
const resolveXpToken = () => {
	if (xpContractId) return Promise.resolve(xpContractId)
	xpTokenId ??= factory()
		.then((client) => client.xp_token({}))
		.then((tx) => unwrap<string>(tx.result))
	xpTokenId.catch(() => (xpTokenId = undefined))
	return xpTokenId
}

/** A level whose `balance()` reports the tokens its vault still holds. */
interface VaultClient {
	balance: Call<Record<string, never>, bigint>
}

/** Tokens left in a vault-style instance (levels 1, 2 and 6), in stroops. */
export const fetchVaultBalance = async (
	instanceId: string,
): Promise<bigint> => {
	const client = await getClient<VaultClient>(instanceId)
	const tx = await client.balance({})
	return BigInt(unwrap<bigint>(tx.result))
}

/** Level 5: whether `member` is still on the instance's ban list. */
interface BanClient {
	is_banned: Call<{ member: string }, boolean>
}

export const fetchBanned = async (
	instanceId: string,
	member: string,
): Promise<boolean> => {
	const client = await getClient<BanClient>(instanceId)
	const tx = await client.is_banned({ member })
	return Boolean(unwrap<boolean>(tx.result))
}

/** The player's $DRAIN balance. */
export const fetchXp = async (player: string): Promise<bigint> => {
	const client = await getClient<XpClient>(await resolveXpToken())
	const tx = await client.balance({ id: player })
	return BigInt(unwrap<bigint>(tx.result))
}

let lootAsset: Promise<Asset> | undefined

/**
 * LOOT is a classic Stellar asset: its SAC's `name()` is `CODE:ISSUER`, so
 * the factory's `token()` is enough to find it, nothing to configure.
 */
const resolveLootAsset = () => {
	lootAsset ??= factory()
		.then((client) => client.token({}))
		.then((tx) => getClient<SacClient>(unwrap<string>(tx.result)))
		.then((sac) => sac.name({}))
		.then((tx) => {
			const [code = "", issuer = ""] = unwrap<string>(tx.result).split(":")
			return new Asset(code, issuer)
		})
	lootAsset.catch(() => (lootAsset = undefined))
	return lootAsset
}

export interface LootStatus {
	/** `CODE:ISSUER`, as `stellar tx new change-trust --line` expects it */
	asset: string
	/** Whether the player can receive LOOT at all */
	trustline: boolean
	/** Whole LOOT units held (the asset has 7 decimals) */
	balance: string
}

/** The player's LOOT trustline and balance: their drained trophies. */
export const fetchLoot = async (player: string): Promise<LootStatus> => {
	const asset = await resolveLootAsset()
	// Read the trustline entry directly: an absent one is an empty result here,
	// where `getAssetBalance` throws "not found"
	const key = xdr.LedgerKey.trustline(
		new xdr.LedgerKeyTrustLine({
			accountId: Keypair.fromPublicKey(player).xdrAccountId(),
			asset: asset.toTrustLineXDRObject(),
		}),
	)
	const { entries } = await server.getLedgerEntries(key)
	const line = entries[0]?.val.trustLine()
	const units = line?.balance().toBigInt() ?? 0n
	return {
		asset: `${asset.getCode()}:${asset.getIssuer()}`,
		trustline: !!line,
		balance: (units / 10_000_000n).toLocaleString(),
	}
}

export interface LeaderboardEntry {
	address: string
	/** `undefined` when the balance can't be read, e.g. its entry expired */
	xp: bigint | undefined
}

/** The factory's `players` page size (`MAX_PAGE` in the contract). */
const PLAYERS_PAGE = 50

/**
 * Every player who solved a level, as the factory lists them. Kept on-chain
 * rather than rebuilt from events, which RPC servers only keep for days.
 */
const fetchPlayers = async (): Promise<string[]> => {
	const client = await factory()
	const count = Number(unwrap<number>((await client.player_count({})).result))
	const pages = await Promise.all(
		Array.from({ length: Math.ceil(count / PLAYERS_PAGE) }, async (_, i) => {
			const tx = await client.players({
				start: i * PLAYERS_PAGE,
				limit: PLAYERS_PAGE,
			})
			return unwrap<string[]>(tx.result)
		}),
	)
	return pages.flat()
}

/** Players ranked by their $DRAIN balance; unreadable balances come last. */
export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
	const entries = await Promise.all(
		(await fetchPlayers()).map(async (address) => ({
			address,
			xp: await fetchXp(address).catch(() => undefined),
		})),
	)
	const rank = (xp: bigint | undefined) => xp ?? -1n
	return entries.sort((a, b) =>
		rank(b.xp) > rank(a.xp) ? 1 : rank(b.xp) < rank(a.xp) ? -1 : 0,
	)
}

/** How many distinct players have solved each level. */
export const fetchSolveCounts = async (
	levelIds: number[],
): Promise<Map<number, number>> => {
	const client = await factory()
	const counts = await Promise.all(
		levelIds.map(async (id) => {
			const tx = await client.solves({ level_id: id })
			return [id, Number(unwrap<number>(tx.result))] as const
		}),
	)
	return new Map(counts)
}

/** Testnet explorer links (stellar.expert). */
const explorerBase = `https://stellar.expert/explorer/${stellarNetwork === "PUBLIC" ? "public" : stellarNetwork.toLowerCase()}`
export const explorerTx = (hash: string) => `${explorerBase}/tx/${hash}`
export const explorerContract = (id: string) => `${explorerBase}/contract/${id}`
