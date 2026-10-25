import {
	factoryContractId,
	fetchInstance,
	fetchLoot,
	fetchLeaderboard,
	fetchProgress,
	fetchRegisteredLevels,
	fetchXp,
	isSafeNetwork,
	networkPassphrase,
} from "@stellar-scaffold/app-lib"
import { useQuery } from "@tanstack/react-query"
import { levels } from "../game/levels"
import { useWallet } from "./useWallet"

/**
 * Levels registered in the factory, with their on-chain XP reward. A level
 * missing from the map isn't deployed yet ("soon"). `undefined` while loading
 * or when the factory isn't reachable: callers fall back to `levels.ts`.
 */
export const useRegisteredLevels = () => {
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["registered-levels"],
		queryFn: () => fetchRegisteredLevels(levels.map((l) => l.id)),
		enabled: ready,
		staleTime: 60_000,
	})
}

/** Whether the game can talk to its contracts, and why not if it can't. */
export const useGameStatus = () => {
	const { address, networkPassphrase: walletPassphrase } = useWallet()

	// Most wallets report their network; when one doesn't, let it through and
	// rely on the signature request showing the network.
	const wrongNetwork =
		!!address && !!walletPassphrase && walletPassphrase !== networkPassphrase

	return {
		configured: !!factoryContractId,
		wrongNetwork,
		unsafeNetwork: !isSafeNetwork,
		ready: !!factoryContractId && isSafeNetwork && !wrongNetwork,
	}
}

export const useProgress = () => {
	const { address } = useWallet()
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["progress", address],
		queryFn: () => fetchProgress(address!),
		enabled: ready && !!address,
	})
}

export const useXp = () => {
	const { address } = useWallet()
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["xp", address],
		queryFn: () => fetchXp(address!),
		enabled: ready && !!address,
	})
}

export const useInstance = (levelId: number) => {
	const { address } = useWallet()
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["instance", address, levelId],
		queryFn: () => fetchInstance(address!, levelId),
		enabled: ready && !!address,
	})
}

/** Instances for every level at once, for the status column on Home. */
export const useInstances = (levelIds: number[]) => {
	const { address } = useWallet()
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["instances", address, levelIds],
		queryFn: async () => {
			const entries = await Promise.all(
				levelIds.map(
					async (id) =>
						[
							id,
							await fetchInstance(address!, id).catch(() => undefined),
						] as const,
				),
			)
			return new Map(entries)
		},
		enabled: ready && !!address,
	})
}

/** LOOT trustline + balance of the connected player. */
export const useLoot = (enabled = true) => {
	const { address } = useWallet()
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["loot", address],
		queryFn: () => fetchLoot(address!),
		enabled: enabled && ready && !!address,
		// The trustline gets added from the CLI: notice it without a reload
		refetchInterval: (query) => (query.state.data?.trustline ? false : 5_000),
	})
}

export const useLeaderboard = () => {
	const { ready } = useGameStatus()
	return useQuery({
		queryKey: ["leaderboard"],
		queryFn: fetchLeaderboard,
		enabled: ready,
		staleTime: 30_000,
	})
}
