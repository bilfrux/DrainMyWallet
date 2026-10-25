import { connectWallet } from "@stellar-scaffold/app-lib"
import React from "react"
import { Link } from "react-router-dom"
import Terminal from "../components/Terminal"
import Typewriter from "../components/Typewriter"
import { REPO_URL } from "../game/config"
import { type Level, levels, pad } from "../game/levels"
import { useCountUp } from "../hooks/useCountUp"
import {
	useGameStatus,
	useRegisteredLevels,
	useInstances,
	useProgress,
	useXp,
} from "../hooks/useGame"
import { useWallet } from "../hooks/useWallet"
import styles from "./Home.module.css"

type Status = "solved" | "in-progress" | "locked" | "soon"

const STATUS_LABEL: Record<Status, string> = {
	solved: "[ PWNED ]",
	"in-progress": "[ IN PROGRESS ]",
	locked: "[ LOCKED ]",
	soon: "[ SOON ]",
}

const PITCH =
	"Every level is a deliberately vulnerable Soroban contract. Deploy your own instance on testnet, break it from your terminal, then come back and let the chain verify you won."

const Home: React.FC = () => {
	const { address } = useWallet()
	const { configured } = useGameStatus()
	const { data: solved } = useProgress()
	const { data: instances } = useInstances(levels.map((l) => l.id))
	const { data: xp } = useXp()
	const { data: registered } = useRegisteredLevels()
	const xpShown = useCountUp(Number(xp ?? 0n))

	const statusOf = (id: number): Status =>
		solved?.includes(id)
			? "solved"
			: registered && !registered.has(id)
				? "soon"
				: instances?.get(id)
					? "in-progress"
					: "locked"

	// The factory's reward wins once the level is registered
	const xpOf = (level: Level) =>
		Number(registered?.get(level.id) ?? BigInt(level.xp))

	const maxXp = levels.reduce((sum, l) => sum + xpOf(l), 0)

	return (
		<div className={styles.Home}>
			<section className={styles.hero}>
				<p className={styles.boot}>
					root@meridian:~# ./wargame --network testnet
				</p>
				<h1 className={styles.title} data-text="DRAIN MY WALLET">
					DRAIN MY WALLET
				</h1>
				<p className={styles.pitch}>
					<Typewriter text={PITCH} />
				</p>
				<p className={styles.subpitch}>
					Ethernaut trained a generation of Ethereum developers. Soroban
					doesn&apos;t play by the same rules, so it gets its own training
					ground.{" "}
					<a href={REPO_URL} target="_blank" rel="noreferrer">
						Read the source ↗
					</a>
				</p>
			</section>

			<Terminal title="~/player/stats">
				{address ? (
					<div className={styles.stats}>
						<div>
							<span className={styles.statLabel}>$DRAIN earned</span>
							<span className={styles.statValue}>
								{xpShown.toLocaleString()}
							</span>
							<span className={styles.statMax}>/ {maxXp} XP</span>
						</div>
						<div>
							<span className={styles.statLabel}>levels pwned</span>
							<span className={styles.statValue}>{solved?.length ?? 0}</span>
							<span className={styles.statMax}>/ {levels.length}</span>
						</div>
					</div>
				) : (
					<div className={styles.connect}>
						<p>
							<span className={styles.muted}>$</span> whoami
							<br />
							<span className={styles.muted}>
								anonymous. connect a testnet wallet to track your progress.
							</span>
						</p>
						<button onClick={() => void connectWallet()}>Connect wallet</button>
					</div>
				)}
				{!configured && (
					<p className={styles.offline}>
						! factory contract not configured: set{" "}
						<code>PUBLIC_FACTORY_CONTRACT_ID</code> in <code>app/.env</code>
					</p>
				)}
			</Terminal>

			<Terminal title="~/levels — ls -la">
				<ol className={styles.levels}>
					{levels.map((level) => {
						const status = statusOf(level.id)
						return (
							<li key={level.id}>
								<Link
									to={`/level/${level.id}`}
									className={`${styles.level} ${styles[status]}`}
								>
									<span className={styles.levelId}>{pad(level.id)}</span>
									<span className={styles.levelName}>
										{level.name}
										{level.bonus && <span className={styles.bonus}>bonus</span>}
									</span>
									<span className={styles.levelGoal}>{level.goal}</span>
									<span className={styles.levelXp}>+{xpOf(level)} XP</span>
									<span className={styles.levelStatus}>
										{STATUS_LABEL[status]}
									</span>
								</Link>
							</li>
						)
					})}
				</ol>
			</Terminal>
		</div>
	)
}

export default Home
