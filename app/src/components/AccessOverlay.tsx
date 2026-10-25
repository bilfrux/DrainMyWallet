import { explorerTx } from "@stellar-scaffold/app-lib"
import { useEffect } from "react"
import { useCountUp } from "../hooks/useCountUp"
import styles from "./AccessOverlay.module.css"

export type CheckOutcome =
	| { solved: true; xp: number; txHash?: string }
	| { solved: false }

/**
 * Full-screen verdict after "Check": the screen turns green and the XP reward
 * counts up, or it flashes red. Esc or a click dismisses it.
 */
const AccessOverlay = ({
	outcome,
	onClose,
}: {
	outcome: CheckOutcome
	onClose: () => void
}) => {
	const xp = useCountUp(outcome.solved ? outcome.xp : 0, 1600)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [onClose])

	return (
		<div
			className={`${styles.overlay} ${outcome.solved ? styles.granted : styles.denied}`}
			role="alertdialog"
			aria-live="assertive"
			aria-label={outcome.solved ? "Access granted" : "Access denied"}
			onClick={onClose}
		>
			<div className={styles.panel} onClick={(e) => e.stopPropagation()}>
				<p className={styles.verdict}>
					{outcome.solved ? "ACCESS GRANTED" : "ACCESS DENIED"}
				</p>
				{outcome.solved ? (
					<>
						<p className={styles.xp}>+{xp} $DRAIN</p>
						<p>is_solved() returned true. Verified on-chain.</p>
						{outcome.txHash && (
							<a
								href={explorerTx(outcome.txHash)}
								target="_blank"
								rel="noreferrer"
							>
								view transaction on stellar.expert ↗
							</a>
						)}
					</>
				) : (
					<p>
						is_solved() returned false. The contract is still standing. Keep
						digging.
					</p>
				)}
				<button onClick={onClose} autoFocus>
					{outcome.solved ? "Continue" : "Back to work"}
				</button>
			</div>
		</div>
	)
}

export default AccessOverlay
