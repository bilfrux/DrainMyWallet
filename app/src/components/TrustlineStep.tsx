import { useLoot } from "../hooks/useGame"
import CopyBlock from "./guide/CopyBlock"
import styles from "./TrustlineStep.module.css"

/**
 * LOOT is a classic Stellar asset, so the account that receives the vault's
 * tokens must trust it first. Without the trustline the exploit fails with
 * `Error(Contract, #13)`, which looks like the level is broken. The site never
 * signs this for the player: it shows the CLI command and watches the wallet's
 * account for the trustline to appear.
 */
const TrustlineStep = () => {
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
				{isError ? "!" : "✗"} The loot is a classic Stellar asset. An account
				can&apos;t receive it until it trusts LOOT, and the exploit fails with{" "}
				<code>Error(Contract, #13)</code>. Open the trustline on the account you
				send the loot to, signing with its CLI key:
			</p>
			<CopyBlock
				text={`stellar tx new change-trust \\
  --line ${data?.asset ?? "LOOT:<issuer>"} \\
  --source-account me \\
  --network testnet`}
			/>
			{!isError && (
				<p className={styles.muted}>
					waiting for a trustline on your wallet&apos;s account (loot sent to
					another key works too, this page just can&apos;t see it)
					<span className="cursor" />
				</p>
			)}
		</div>
	)
}

export default TrustlineStep
