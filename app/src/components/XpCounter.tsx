import { useCountUp } from "../hooks/useCountUp"
import { useXp } from "../hooks/useGame"
import { useWallet } from "../hooks/useWallet"
import styles from "./XpCounter.module.css"

/** The player's $DRAIN total, animating up when it changes. */
const XpCounter = () => {
	const { address } = useWallet()
	const { data } = useXp()
	const xp = useCountUp(Number(data ?? 0n))

	if (!address) return null

	return (
		<div className={styles.xp} title="$DRAIN: non-transferable XP">
			<span className={styles.label}>$DRAIN</span>
			<span className={styles.value}>{xp.toLocaleString()}</span>
		</div>
	)
}

export default XpCounter
