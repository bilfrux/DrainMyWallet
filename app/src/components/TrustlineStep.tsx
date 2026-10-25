import { useLoot } from "../hooks/useGame"
import styles from "./TrustlineStep.module.css"

/**
 * LOOT is a classic Stellar asset, so the player's account must trust it
 * before it can receive the vault's tokens. Without the trustline the exploit
 * fails with `Error(Contract, #13)`, which looks like the level is broken.
 * The site never signs this for the player: it shows the CLI command and
 * watches for the trustline to appear.
 */
const TrustlineStep = ({ address }: { address: string }) => {
	const { data, isLoading, isError } = useLoot()

	if (isLoading) {
		return (
			<p className={styles.muted}>
				checking LOOT trustline
				<span className="cursor" />
			</p>
		)
	}

	if (data?.trustline) {
		return (
			<p className={styles.ok}>
				✓ LOOT trustline open · you hold <strong>{data.balance} LOOT</strong>
			</p>
		)
	}

	return (
		<div className={styles.step}>
			<p className={styles.label}>step 0 · open a LOOT trustline</p>
			<p className={styles.warn}>
				{isError ? "!" : "✗"} The loot is a classic Stellar asset. Your account
				can&apos;t receive it until it trusts LOOT, and the exploit fails with{" "}
				<code>Error(Contract, #13)</code>.
			</p>
			<pre className={styles.cli}>
				{`stellar tx new change-trust \\
  --line ${data?.asset ?? "LOOT:<issuer>"} \\
  --source-account ${address} \\
  --network testnet`}
			</pre>
			{!isError && (
				<p className={styles.muted}>
					waiting for the trustline
					<span className="cursor" />
				</p>
			)}
		</div>
	)
}

export default TrustlineStep
