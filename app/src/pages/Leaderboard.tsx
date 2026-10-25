import { errorMessage, shortAddress } from "@stellar-scaffold/app-lib"
import Terminal from "../components/Terminal"
import { useGameStatus, useLeaderboard } from "../hooks/useGame"
import { useWallet } from "../hooks/useWallet"
import styles from "./Leaderboard.module.css"

const RANK_GLYPH = ["#1", "#2", "#3"]

const Leaderboard = () => {
	const { address } = useWallet()
	const { configured } = useGameStatus()
	const { data, isLoading, error, refetch, isFetching } = useLeaderboard()

	return (
		<div className={styles.Leaderboard}>
			<header>
				<p className={styles.path}>~/leaderboard</p>
				<h1 className={styles.title}>HALL OF DRAINERS</h1>
				<p className={styles.sub}>
					Ranked by <code>$DRAIN</code>, the soulbound XP minted when the
					factory verifies a level. Looted tokens don&apos;t count, and XP
					can&apos;t be transferred.
				</p>
			</header>

			<Terminal title="sort -k2 -nr players.db">
				{!configured ? (
					<p className={styles.muted}>
						Factory not configured: no players to rank yet.
					</p>
				) : isLoading ? (
					<p className={styles.muted}>
						scanning factory events
						<span className="cursor" />
					</p>
				) : error ? (
					<div className={styles.error}>
						<p>error: {errorMessage(error)}</p>
						<button onClick={() => void refetch()}>retry</button>
					</div>
				) : !data?.length ? (
					<p className={styles.muted}>
						No one has drained anything yet. Be the first.
					</p>
				) : (
					<table className={styles.table}>
						<thead>
							<tr>
								<th scope="col">rank</th>
								<th scope="col">player</th>
								<th scope="col">$DRAIN</th>
							</tr>
						</thead>
						<tbody>
							{data.map((entry, i) => (
								<tr
									key={entry.address}
									className={`${i < 3 ? styles.podium : ""} ${entry.address === address ? styles.you : ""}`}
								>
									<td className={styles.rank}>{RANK_GLYPH[i] ?? i + 1}</td>
									<td title={entry.address}>
										<span className={styles.full}>{entry.address}</span>
										<span className={styles.short}>
											{shortAddress(entry.address)}
										</span>
										{entry.address === address && (
											<span className={styles.youTag}>you</span>
										)}
									</td>
									<td className={styles.xp}>{entry.xp.toLocaleString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{configured && !isLoading && (
					<button
						className={styles.refresh}
						onClick={() => void refetch()}
						disabled={isFetching}
					>
						{isFetching ? "refreshing…" : "refresh"}
					</button>
				)}
			</Terminal>
		</div>
	)
}

export default Leaderboard
