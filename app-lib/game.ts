import { contract, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk"
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
 *   PUBLIC_XP_CONTRACT_ID=C...
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

/** $DRAIN balance. Falls back to 0 when the XP token isn't configured. */
export const fetchXp = async (player: string): Promise<bigint> => {
	if (!xpContractId) return 0n
	const client = await getClient<XpClient>(xpContractId)
	const tx = await client.balance({ id: player })
	return BigInt(unwrap<bigint>(tx.result))
}

export interface LeaderboardEntry {
	address: string
	xp: bigint
}

/** Every Stellar account (G...) address found anywhere in a decoded value. */
const collectAccounts = (value: unknown, into: Set<string>) => {
	if (typeof value === "string") {
		if (/^G[A-Z2-7]{55}$/.test(value)) into.add(value)
	} else if (Array.isArray(value)) {
		value.forEach((v) => collectAccounts(v, into))
	} else if (value !== null && typeof value === "object") {
		Object.values(value).forEach((v) => collectAccounts(v, into))
	}
}

const decode = (val: xdr.ScVal): unknown => {
	try {
		return scValToNative(val)
	} catch {
		return undefined
	}
}

/**
 * Players come from the factory's events (instances created, levels
 * submitted) within the RPC retention window, then get ranked by $DRAIN. The
 * event layout isn't assumed: any account address in a topic or value counts.
 */
export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
	const factoryId = requireFactory()
	const { oldestLedger } = await server.getHealth()
	const players = new Set<string>()

	let request: rpc.Api.GetEventsRequest = {
		filters: [{ type: "contract", contractIds: [factoryId] }],
		startLedger: oldestLedger,
		limit: 1000,
	}
	for (let page = 0; page < 20; page++) {
		const { events, cursor } = await server.getEvents(request)
		for (const event of events) {
			event.topic.forEach((t) => collectAccounts(decode(t), players))
			collectAccounts(decode(event.value), players)
		}
		if (events.length < 1000) break
		request = { filters: request.filters, cursor, limit: 1000 }
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
