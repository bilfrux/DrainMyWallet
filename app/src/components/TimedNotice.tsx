import { useBanned } from "../hooks/useGame"
import styles from "./TimedNotice.module.css"

/**
 * Level 5's exploit is waiting: a ban kept in temporary storage only lasts as
 * long as the network's minimum time-to-live, about an hour on testnet. Say so
 * up front, and once the player has an instance, say where the clock stands.
 */
const TimedNotice = ({ instanceId }: { instanceId?: string }) => {
	const banned = useBanned(instanceId)

	return (
		<aside
			className={styles.notice}
			aria-label="This level takes about an hour"
		>
			<p className={styles.title}>⏱ This level takes about an hour</p>
			<p>
				The ban is kept in <strong>temporary storage</strong>, which the network
				deletes after at least 720 ledgers: roughly <strong>an hour</strong> on
				testnet. Create your instance now, do something else, and come back.
				Check will fail until the ban has expired.
			</p>
			{instanceId && (
				<p className={styles.status} aria-live="polite">
					{banned.data === undefined ? (
						"reading your ban status…"
					) : banned.data ? (
						<>
							<span className={styles.wait}>● ban still active</span> (checked
							every 20 s, you can leave this page)
						</>
					) : (
						<span className={styles.go}>
							✓ ban expired: claim now, then press Check
						</span>
					)}
				</p>
			)}
		</aside>
	)
}

export default TimedNotice
