import {
	connectWallet,
	createInstance,
	errorMessage,
	explorerContract,
	explorerTx,
	submitLevel,
} from "@stellar-scaffold/app-lib"
import { useQueryClient } from "@tanstack/react-query"
import { useState, useTransition } from "react"
import { Link, useParams } from "react-router-dom"
import AccessOverlay, { type CheckOutcome } from "../components/AccessOverlay"
import SourceView from "../components/SourceView"
import Terminal from "../components/Terminal"
import Typewriter from "../components/Typewriter"
import { getLevel, pad } from "../game/levels"
import { useGameStatus, useInstance, useProgress } from "../hooks/useGame"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import styles from "./Level.module.css"
import NotFound from "./NotFound"

const LevelPage = () => {
	const { id } = useParams()
	const level = getLevel(Number(id))
	const { address } = useWallet()
	const { configured, ready } = useGameStatus()
	const { addNotification } = useNotification()
	const queryClient = useQueryClient()
	const instance = useInstance(level?.id ?? 0)
	const { data: solved } = useProgress()
	const [showHint, setShowHint] = useState(false)
	const [outcome, setOutcome] = useState<CheckOutcome>()
	const [deployTx, setDeployTx] = useState<string>()
	const [isCreating, startCreate] = useTransition()
	const [isChecking, startCheck] = useTransition()

	if (!level) return <NotFound />

	const instanceId = instance.data
	const isSolved = solved?.includes(level.id) ?? false
	const busy = isCreating || isChecking

	const refresh = () =>
		Promise.all(
			["instance", "instances", "progress", "xp", "leaderboard"].map((key) =>
				queryClient.invalidateQueries({ queryKey: [key] }),
			),
		)

	const create = () =>
		startCreate(async () => {
			if (!address) return
			try {
				const { txHash } = await createInstance(address, level.id)
				setDeployTx(txHash)
				addNotification("Instance deployed. Go break it.", "success")
				await refresh()
			} catch (e) {
				console.error(e)
				addNotification(`Deploy failed: ${errorMessage(e)}`, "error")
			}
		})

	const check = () =>
		startCheck(async () => {
			if (!address) return
			try {
				const { result, txHash } = await submitLevel(address, level.id)
				// A second submit on a solved level mints nothing (SPEC §4)
				setOutcome(
					result
						? { solved: true, xp: isSolved ? 0 : level.xp, txHash }
						: { solved: false },
				)
				if (result) await refresh()
			} catch (e) {
				console.error(e)
				addNotification(`Check failed: ${errorMessage(e)}`, "error")
			}
		})

	return (
		<div className={styles.Level}>
			<Link to="/" className={styles.back}>
				cd ..
			</Link>

			<header className={styles.header}>
				<p className={styles.path}>~/levels/{level.slug}</p>
				<h1 className={styles.title}>
					<span className={styles.num}>{pad(level.id)}</span> {level.name}
				</h1>
				<div className={styles.meta}>
					<span className={styles.reward}>+{level.xp} $DRAIN</span>
					{level.bonus && <span className={styles.tag}>bonus</span>}
					{isSolved && <span className={styles.pwned}>PWNED</span>}
				</div>
				<p className={styles.story}>
					<Typewriter text={level.story} />
				</p>
				<p className={styles.goal}>
					<span className={styles.prompt}>objective:</span> {level.goal}
				</p>
			</header>

			<div className={styles.grid}>
				<Terminal title="instance" className={styles.instance}>
					{!configured ? (
						<p className={styles.warn}>
							Factory not configured. Set{" "}
							<code>PUBLIC_FACTORY_CONTRACT_ID</code> in <code>app/.env</code>.
						</p>
					) : !address ? (
						<>
							<p>
								Connect a testnet wallet to deploy your own copy of this
								contract.
							</p>
							<button onClick={() => void connectWallet()}>
								Connect wallet
							</button>
						</>
					) : (
						<>
							<p className={styles.label}>your instance</p>
							{instance.isLoading ? (
								<p className={styles.muted}>querying factory…</p>
							) : instanceId ? (
								<p className={styles.address}>
									<code>{instanceId}</code>{" "}
									<a
										href={explorerContract(instanceId)}
										target="_blank"
										rel="noreferrer"
									>
										explorer ↗
									</a>
								</p>
							) : (
								<p className={styles.muted}>none yet</p>
							)}
							{deployTx && (
								<p className={styles.small}>
									<a
										href={explorerTx(deployTx)}
										target="_blank"
										rel="noreferrer"
									>
										deploy tx ↗
									</a>
								</p>
							)}

							<div className={styles.actions}>
								<button onClick={create} disabled={!ready || busy}>
									{isCreating
										? "Deploying…"
										: instanceId
											? "Create a fresh instance"
											: "Create my instance"}
								</button>
								<button
									className={styles.check}
									onClick={check}
									disabled={!ready || busy || !instanceId}
								>
									{isChecking ? "Verifying…" : "Check"}
								</button>
							</div>

							{instanceId && (
								<>
									<p className={styles.label}>attack from your terminal</p>
									<pre className={styles.cli}>
										{`stellar contract invoke \\
  --id ${instanceId} \\
  --source <your-key> --network testnet \\
  -- --help`}
									</pre>
								</>
							)}
							<p className={styles.small}>
								Deploying costs about 73 testnet XLM of storage rent: use{" "}
								<em>Fund account</em> (Friendbot) if you run low. The site never
								signs an exploit for you. It only deploys instances and verifies
								wins.
							</p>
						</>
					)}
				</Terminal>

				<Terminal title="hint.txt" className={styles.hint}>
					{showHint ? (
						<p>
							<Typewriter text={level.hint} speedMs={22} />
						</p>
					) : (
						<>
							<p className={styles.muted}>
								Stuck? The hint narrows it down without giving the exploit away.
							</p>
							<button onClick={() => setShowHint(true)}>cat hint.txt</button>
						</>
					)}
				</Terminal>
			</div>

			<Terminal title={`contracts/levels/${level.slug}/src/lib.rs`}>
				{level.source ? (
					<SourceView source={level.source} />
				) : (
					<p className={styles.muted}>
						{"// "}contract not written yet. Its source appears here as soon as{" "}
						<code>contracts/levels/{level.slug}/src/lib.rs</code> exists.
					</p>
				)}
			</Terminal>

			{outcome && (
				<AccessOverlay
					outcome={outcome}
					onClose={() => setOutcome(undefined)}
				/>
			)}
		</div>
	)
}

export default LevelPage
