import { connectWallet } from "@stellar-scaffold/app-lib"
import React, { useState } from "react"
import { Link } from "react-router-dom"
import Terminal from "../components/Terminal"
import {
	CATEGORIES,
	type Category,
	DIFFICULTY_LABEL,
	type Difficulty,
	type Level,
	levels,
	pad,
} from "../game/levels"
import { useCountUp } from "../hooks/useCountUp"
import {
	useGameStatus,
	useRegisteredLevels,
	useInstances,
	useProgress,
	useSolveCounts,
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

type SortKey = "level" | "difficulty" | "xp" | "solves"

const SORTS: { key: SortKey; label: string }[] = [
	{ key: "level", label: "level" },
	{ key: "difficulty", label: "difficulty" },
	{ key: "xp", label: "XP" },
	{ key: "solves", label: "solves" },
]

const Pips = ({ value }: { value: Difficulty }) => (
	<span
		className={`${styles.pips} ${styles["d" + value]}`}
		title={DIFFICULTY_LABEL[value]}
	>
		<span aria-hidden="true">
			{"●".repeat(value)}
			<i>{"●".repeat(3 - value)}</i>
		</span>
		<span className="sr-only">{DIFFICULTY_LABEL[value]}</span>
	</span>
)

const Play: React.FC = () => {
	const { address } = useWallet()
	const { configured } = useGameStatus()
	const { data: solved } = useProgress()
	const { data: instances } = useInstances(levels.map((l) => l.id))
	const { data: xp } = useXp()
	const { data: registered } = useRegisteredLevels()
	const { data: solveCounts } = useSolveCounts()
	const [category, setCategory] = useState<Category | "all">("all")
	const [difficulty, setDifficulty] = useState<Difficulty | "all">("all")
	const [hideSolved, setHideSolved] = useState(false)
	const [sort, setSort] = useState<SortKey>("level")
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

	const solvesOf = (level: Level) => solveCounts?.get(level.id) ?? 0

	const visible = levels
		.filter((l) => category === "all" || l.category === category)
		.filter((l) => difficulty === "all" || l.difficulty === difficulty)
		.filter((l) => !(hideSolved && solved?.includes(l.id)))
		.sort((a, b) => {
			switch (sort) {
				case "difficulty":
					return a.difficulty - b.difficulty || a.id - b.id
				case "xp":
					return xpOf(b) - xpOf(a) || a.id - b.id
				case "solves":
					return solvesOf(b) - solvesOf(a) || a.id - b.id
				default:
					return a.id - b.id
			}
		})

	const countIn = (c: Category) => levels.filter((l) => l.category === c).length

	return (
		<div className={styles.Home}>
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
				<div className={styles.filters} role="group" aria-label="Filter levels">
					<div className={styles.chips}>
						<button
							className={styles.chip}
							aria-pressed={category === "all"}
							onClick={() => setCategory("all")}
						>
							all <em>{levels.length}</em>
						</button>
						{CATEGORIES.map((c) => (
							<button
								key={c}
								className={styles.chip}
								aria-pressed={category === c}
								onClick={() => setCategory(c)}
							>
								{c} <em>{countIn(c)}</em>
							</button>
						))}
					</div>
					<div className={styles.chips}>
						{([1, 2, 3] as const).map((d) => (
							<button
								key={d}
								className={`${styles.chip} ${styles["d" + d]}`}
								aria-pressed={difficulty === d}
								onClick={() => setDifficulty(difficulty === d ? "all" : d)}
							>
								{DIFFICULTY_LABEL[d]}
							</button>
						))}
						<label className={styles.check}>
							<input
								type="checkbox"
								checked={hideSolved}
								onChange={(e) => setHideSolved(e.target.checked)}
							/>
							hide solved
						</label>
						<label className={styles.sort}>
							sort by{" "}
							<select
								value={sort}
								onChange={(e) => setSort(e.target.value as SortKey)}
							>
								{SORTS.map((o) => (
									<option key={o.key} value={o.key}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>

				<ol className={styles.levels}>
					{visible.length === 0 && (
						<li className={styles.empty}>
							no level matches these filters{" "}
							<button
								onClick={() => {
									setCategory("all")
									setDifficulty("all")
									setHideSolved(false)
								}}
							>
								reset
							</button>
						</li>
					)}
					{visible.map((level) => {
						const status = statusOf(level.id)
						const solves = solvesOf(level)
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
										<span className={styles.levelCategory}>
											{level.category}
										</span>
									</span>
									<span className={styles.levelGoal}>{level.goal}</span>
									<Pips value={level.difficulty} />
									<span className={styles.levelSolves}>
										{solveCounts
											? `${solves} ${solves === 1 ? "solve" : "solves"}`
											: "…"}
									</span>
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

export default Play
