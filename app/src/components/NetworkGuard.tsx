import { networkStatus } from "@stellar-scaffold/app-lib"
import { type ReactNode } from "react"
import { useGameStatus } from "../hooks/useGame"
import { useWallet } from "../hooks/useWallet"
import Terminal from "./Terminal"

/**
 * Refuses to render the game while the wallet is on another network, or if
 * the app was built for mainnet (SPEC §6: testnet only, never real funds).
 */
const NetworkGuard = ({ children }: { children: ReactNode }) => {
	const { address, networkPassphrase } = useWallet()
	const { wrongNetwork, unsafeNetwork } = useGameStatus()

	if (unsafeNetwork) {
		return (
			<Terminal title="fatal" tone="danger">
				<h2>MAINNET DETECTED. REFUSING TO RUN.</h2>
				<p>
					This build points at Stellar mainnet. DrainMyWallet only ever runs on
					testnet. Rebuild with <code>STELLAR_NETWORK=testnet</code>.
				</p>
			</Terminal>
		)
	}

	if (wrongNetwork) {
		const { walletNetwork, appNetwork } = networkStatus(
			address,
			networkPassphrase,
		)
		return (
			<Terminal title="network_guard" tone="danger">
				<h2>ACCESS REFUSED: WRONG NETWORK</h2>
				<p>
					Your wallet is on <strong>{walletNetwork}</strong>. This wargame only
					runs on <strong>{appNetwork}</strong>, with fake money.
				</p>
				<p>
					Open Freighter → settings → network, pick <code>Testnet</code>. This
					page unlocks by itself.
				</p>
			</Terminal>
		)
	}

	return children
}

export default NetworkGuard
