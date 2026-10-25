import {
	Asset,
	contract,
	Keypair,
	rpc,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk"
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
	xp: bigint
}

const decode = (val: xdr.ScVal): unknown => {
	try {
		return scValToNative(val)
	} catch {
		return undefined
	}
}

const LEVEL_SOLVED = xdr.ScVal.scvSymbol("level_solved").toXDR("base64")

/**
 * Players come from the factory's `level_solved` events (topics: name,
 * player, level_id) within the RPC retention window, then get ranked by their
 * $DRAIN balance. RPC scans a bounded ledger range per request and can return
 * an empty page with a cursor, so page until the cursor reaches the tip.
 */
export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
	const factoryId = requireFactory()
	const { oldestLedger, latestLedger } = await server.getHealth()
	const players = new Set<string>()
	const filters: rpc.Api.EventFilter[] = [
		{
			type: "contract",
			contractIds: [factoryId],
			topics: [[LEVEL_SOLVED, "*", "*"]],
		},
	]

	let request: rpc.Api.GetEventsRequest = {
		filters,
		startLedger: oldestLedger,
		limit: 1000,
	}
	for (let page = 0; page < 50; page++) {
		const { events, cursor } = await server.getEvents(request)
		for (const event of events) {
			const player = event.topic[1] && decode(event.topic[1])
			if (typeof player === "string") players.add(player)
		}
		// Cursors are "<toid>-<index>"; the ledger is the toid's high 32 bits
		const scanned = Number(BigInt(cursor.split("-")[0] ?? "0") >> 32n)
		if (scanned >= latestLedger) break
		request = { filters, cursor, limit: 1000 }
	}

	const entries = await Promise.all(
		[...players].map(async (address) => ({
			address,
			xp: await fetchXp(address).catch(() => 0n),
		})),
	)
	return entries
		.filter((e) => e.xp > 0n)
		.sort((a, b) => (b.xp > a.xp ? 1 : b.xp < a.xp ? -1 : 0))
}

/** Testnet explorer links (stellar.expert). */
const explorerBase = `https://stellar.expert/explorer/${stellarNetwork === "PUBLIC" ? "public" : stellarNetwork.toLowerCase()}`
export const explorerTx = (hash: string) => `${explorerBase}/tx/${hash}`
export const explorerContract = (id: string) => `${explorerBase}/contract/${id}`
