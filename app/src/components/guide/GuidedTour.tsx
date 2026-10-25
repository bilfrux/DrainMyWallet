import { connectWallet } from "@stellar-scaffold/app-lib"
import { type ReactNode, useEffect, useState } from "react"
import { useLoot, useVaultBalance } from "../../hooks/useGame"
import { useWallet } from "../../hooks/useWallet"
import FundAccountButton from "../FundAccountButton"
import CopyBlock from "./CopyBlock"
import styles from "./GuidedTour.module.css"

interface GuidedTourProps {
	instanceId?: string
	isSolved: boolean
	xp: number
	canPlay: boolean
	creating: boolean
	checking: boolean
	onCreate: () => void
	onCheck: () => void
}

/** Vault of level 1 at the start: 1,000 tokens of 7 decimals */
const VAULT_START = 1_000
const STROOPS = 10_000_000n
const FULL_AMOUNT = (BigInt(VAULT_START) * STROOPS).toString()

const store = (key: string) => `dmw-guide-${key}`

/** A manual "I did it" flag that survives a reload (best effort). */
const useFlag = (key: string) => {
	const [on, setOn] = useState(() => {
		try {
			return localStorage.getItem(store(key)) === "1"
		} catch {
			return false
		}
	})
	useEffect(() => {
		try {
			if (on) localStorage.setItem(store(key), "1")
		} catch {
			// private mode: the flag just lasts for this visit
		}
	}, [key, on])
	return [on, setOn] as const
}

interface Step {
	id: string
	title: string
	done: boolean
	summary: string
	body: ReactNode
}

const GLOSSARY = [
	{
		word: "Smart contract",
		text: "A program that lives on the blockchain. Once deployed, nobody can edit it, so its bugs stay.",
	},
	{
		word: "Instance",
		text: "Your own private copy of a level. Break it as much as you like: nobody else is affected.",
	},
	{
		word: "Exploit",
		text: "Using a bug to make a contract do something it was never meant to allow.",
	},
	{
		word: "Check",
		text: "The game inspects your instance on-chain. If it is really broken, you earn XP.",
	},
]

const GuidedTour = ({
	instanceId,
	isSolved,
	xp,
	canPlay,
	creating,
	checking,
	onCreate,
	onCheck,
}: GuidedTourProps) => {
	const { address, balances } = useWallet()
	const loot = useLoot()
	const vault = useVaultBalance(instanceId)
	const [revealed, setRevealed] = useFlag("l1-bug")
	const [toolsReady, setToolsReady] = useFlag("l1-tools")
	const [trustReady, setTrustReady] = useFlag("l1-trust")
	const [open, setOpen] = useState<string>()

	const vaultTokens =
		vault.data === undefined ? undefined : Number(vault.data / STROOPS)
	const vaultEmpty = vault.data === 0n
	const asset = loot.data?.asset ?? "LOOT:<issuer>"
	const instance = instanceId ?? "<your-instance>"

	const steps: Step[] = [
		{
			id: "wallet",
			title: "Connect your wallet",
			done: !!address,
			summary: "Your wallet is your identity on Stellar.",
			body: (
				<>
					<p>
						A wallet (such as Freighter) is how you sign in on a blockchain:
						your address is your account. This site only ever asks it to sign{" "}
						<strong>two things</strong>: creating your instance and checking it.
						It never signs an attack for you.
					</p>
					<p className={styles.tip}>
						Set the wallet to <strong>Testnet</strong>: this is practice money,
						nothing real is at stake.
					</p>
					<button onClick={() => void connectWallet()}>Connect wallet</button>
				</>
			),
		},
		{
			id: "xlm",
			title: "Get free test money",
			done: !!balances.xlm,
			summary: "Every action on Stellar costs a tiny fee.",
			body: (
				<>
					<p>
						On testnet the fees are paid in <strong>fake XLM</strong>. A free
						service called Friendbot hands you some: one click.
					</p>
					<FundAccountButton />
				</>
			),
		},
		{
			id: "instance",
			title: "Create your instance",
			done: !!instanceId,
			summary: "Deploy your own copy of the level.",
			body: (
				<>
					<p>
						This deploys a fresh <strong>vault</strong> contract just for you,
						holding <strong>1,000 LOOT</strong> tokens. Your wallet will ask you
						to approve one transaction.
					</p>
					<button onClick={onCreate} disabled={!canPlay || creating}>
						{creating
							? "Deploying…"
							: instanceId
								? "Create a fresh instance"
								: "Create my instance"}
					</button>
					{instanceId && (
						<p className={styles.small}>
							Your vault lives at <code>{instanceId}</code>
						</p>
					)}
				</>
			),
		},
		{
			id: "read",
			title: "Read the contract and find the bug",
			done: revealed,
			summary: "One function is missing a check. Which one?",
			body: (
				<>
					<p>
						Below the guide is the vault&apos;s full source. Two functions
						matter. Compare them: one of them forgot something important.
					</p>
					<div className={styles.compare}>
						<div>
							<p className={styles.fn}>deposit(from, amount)</p>
							<p>puts tokens into the vault</p>
						</div>
						<div>
							<p className={styles.fn}>withdraw(to, amount)</p>
							<p>takes tokens out of the vault</p>
						</div>
					</div>
					{revealed ? (
						<p className={styles.answer}>
							<code>deposit</code> starts with <code>from.require_auth()</code>:
							&ldquo;prove you are <code>from</code>&rdquo;.{" "}
							<code>withdraw</code> has <strong>no such line</strong>, so anyone
							can empty the vault. In Soroban, nothing is protected unless the
							code asks for it with <code>require_auth()</code>.
						</p>
					) : (
						<>
							<p className={styles.tip}>
								Hint: which of the two checks <em>who is calling</em>?
							</p>
							<button onClick={() => setRevealed(true)}>Show me the bug</button>
						</>
					)}
					<p>
						<button
							className={styles.link}
							onClick={() =>
								document
									.getElementById("source")
									?.scrollIntoView({ behavior: "smooth" })
							}
						>
							Jump to the code ↓
						</button>
					</p>
				</>
			),
		},
		{
			id: "tools",
			title: "Prepare your attacker key",
			done: toolsReady,
			summary: "You attack from a terminal, with a key of your own.",
			body: (
				<>
					<p>
						Exploits are run from your terminal, like a real security test.
						Install the{" "}
						<a
							href="https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
							target="_blank"
							rel="noreferrer"
						>
							Stellar CLI ↗
						</a>
						, then create a throwaway account called <code>attacker</code>{" "}
						(funded with free test XLM):
					</p>
					<CopyBlock
						text={`stellar keys generate attacker --network testnet --fund`}
					/>
					<button onClick={() => setToolsReady(true)}>It&apos;s done</button>
				</>
			),
		},
		{
			id: "trust",
			title: "Let your attacker receive the loot",
			done: toolsReady && trustReady,
			summary: "LOOT is a classic Stellar asset: accounts must opt in.",
			body: (
				<>
					<p>
						An account can only receive an asset it has agreed to hold. This is
						called a <strong>trustline</strong>. Without it your attack fails
						with <code>Error(Contract, #13)</code>.
					</p>
					<CopyBlock
						text={`stellar tx new change-trust \\
  --line ${asset} \\
  --source-account attacker \\
  --network testnet`}
					/>
					<button onClick={() => setTrustReady(true)}>It&apos;s done</button>
				</>
			),
		},
		{
			id: "attack",
			title: "Empty the vault",
			done: vaultEmpty,
			summary: "Call withdraw. Nobody will ask who you are.",
			body: (
				<>
					<p>
						Call <code>withdraw</code> and send the whole vault (1,000 tokens ={" "}
						<code>{FULL_AMOUNT}</code> in the smallest unit) to your attacker
						key:
					</p>
					<CopyBlock
						text={`stellar contract invoke \\
  --id ${instance} \\
  --source-account attacker \\
  --network testnet \\
  -- withdraw \\
  --to $(stellar keys address attacker) \\
  --amount ${FULL_AMOUNT}`}
					/>
					<div className={styles.gauge} aria-live="polite">
						<div className={styles.gaugeLabel}>
							<span>vault</span>
							<span>
								{vaultTokens === undefined
									? instanceId
										? "reading…"
										: "no instance yet"
									: `${vaultTokens.toLocaleString()} / ${VAULT_START.toLocaleString()} LOOT`}
							</span>
						</div>
						<div className={styles.gaugeTrack}>
							<div
								className={styles.gaugeFill}
								style={{
									width: `${
										vaultTokens === undefined
											? 100
											: Math.min(100, (vaultTokens / VAULT_START) * 100)
									}%`,
								}}
							/>
						</div>
						<p className={styles.small}>
							Updates by itself every few seconds once you run the command.
						</p>
					</div>
				</>
			),
		},
		{
			id: "check",
			title: "Ask the chain to verify",
			done: isSolved,
			summary: "Press Check and collect your XP.",
			body: (
				<>
					<p>
						The factory contract looks at your vault. If it is empty, you win{" "}
						<strong>+{xp} $DRAIN</strong>, recorded on-chain, once.
					</p>
					<button
						className={styles.check}
						onClick={onCheck}
						disabled={!canPlay || checking || !instanceId}
					>
						{checking ? "Verifying…" : "Check"}
					</button>
					{vaultEmpty && !isSolved && (
						<p className={styles.tip}>
							Your vault is empty: press Check, it will pass.
						</p>
					)}
				</>
			),
		},
	]

	const firstTodo = steps.findIndex((s) => !s.done)
	const activeIndex = firstTodo === -1 ? steps.length : firstTodo
	const doneCount = steps.filter((s) => s.done).length

	return (
		<section className={styles.tour} aria-label="Guided walkthrough">
			<header className={styles.head}>
				<div>
					<p className={styles.kicker}>guided level · start here</p>
					<h2 className={styles.mission}>Mission: empty the vault.</h2>
				</div>
				<p className={styles.count}>
					{doneCount}/{steps.length}
				</p>
			</header>
			<div className={styles.progress}>
				<div
					className={styles.progressFill}
					style={{ width: `${(doneCount / steps.length) * 100}%` }}
				/>
			</div>

			<details className={styles.glossary} open={doneCount === 0}>
				<summary>New to this? Four words you&apos;ll see</summary>
				<dl>
					{GLOSSARY.map((g) => (
						<div key={g.word}>
							<dt>{g.word}</dt>
							<dd>{g.text}</dd>
						</div>
					))}
				</dl>
			</details>

			<ol className={styles.steps}>
				{steps.map((step, i) => {
					const state = step.done
						? "done"
						: i === activeIndex
							? "active"
							: "todo"
					const expanded = state === "active" || open === step.id
					return (
						<li key={step.id} className={styles.step} data-state={state}>
							<button
								className={styles.stepHead}
								onClick={() =>
									setOpen(expanded && state !== "active" ? undefined : step.id)
								}
								aria-expanded={expanded}
							>
								<span className={styles.badge}>
									{state === "done" ? "✓" : i + 1}
								</span>
								<span className={styles.stepTitle}>
									{step.title}
									{state === "active" && (
										<em className={styles.here}>you are here</em>
									)}
								</span>
								<span className={styles.stepSummary}>{step.summary}</span>
							</button>
							{expanded && <div className={styles.stepBody}>{step.body}</div>}
						</li>
					)
				})}
			</ol>

			{isSolved && (
				<div className={styles.lesson}>
					<p className={styles.kicker}>level pwned</p>
					<p>
						<strong>What you just learned:</strong> in Soroban there is no
						&ldquo;caller&rdquo; that is checked for you. A function that moves
						value must call <code>require_auth()</code> on the address it acts
						for, or anyone can use it. Missing that one line is one of the most
						common real-world bugs.
					</p>
					<p className={styles.small}>
						Next: level 02 shows what happens when setup can be run twice.
					</p>
				</div>
			)}
		</section>
	)
}

export default GuidedTour
