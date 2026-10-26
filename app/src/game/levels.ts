export type Category =
	| "Auth"
	| "Arithmetic"
	| "Storage"
	| "Cross-contract"
	| "Logic"

/** The classes of bug the game teaches, in the order the filters list them */
export const CATEGORIES: Category[] = [
	"Auth",
	"Arithmetic",
	"Storage",
	"Cross-contract",
	"Logic",
]

export type Difficulty = 1 | 2 | 3

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
	1: "Easy",
	2: "Medium",
	3: "Hard",
}

export interface Level {
	id: number
	/** Directory under `contracts/levels/` */
	slug: string
	name: string
	story: string
	goal: string
	hint: string
	xp: number
	category: Category
	difficulty: Difficulty
	bonus?: boolean
	/** Shows the step-by-step walkthrough instead of the bare instance panel */
	guided?: boolean
	/** The exploit takes real waiting time: show the wait notice */
	timed?: boolean
	/**
	 * The exploit pays out LOOT, a classic asset: the player's account needs a
	 * trustline first or the transfer fails with `Error(Contract, #13)`.
	 */
	needsTrustline?: boolean
	/**
	 * The exploit must be signed by the wallet's own account (the instance's
	 * player), so the player needs that account's key in the Stellar CLI.
	 */
	walletSigns?: boolean
	/** Contract source, read at build time from the repo */
	source?: string
}

// The site shows the exact contract the player attacks: the source is pulled
// from `contracts/levels/<slug>/src/lib.rs` at build time. A level whose
// contract isn't written yet simply has no source.
const sources = import.meta.glob<string>(
	"../../../contracts/levels/*/src/lib.rs",
	{ query: "?raw", import: "default", eager: true },
)

const sourceFor = (slug: string) =>
	Object.entries(sources).find(([path]) =>
		path.includes(`/levels/${slug}/`),
	)?.[1]

const LEVELS: Omit<Level, "source">[] = [
	{
		id: 1,
		slug: "01-open-door",
		category: "Auth",
		difficulty: 1,
		name: "Open Door",
		story:
			"A vault holds 1,000 tokens behind a heavy steel door. The architect spent weeks on the deposit logic, and about five minutes on the way out.",
		goal: "Empty the vault.",
		hint: "Look at who is allowed to call withdraw. Then look again. In Soroban, nothing is protected unless someone calls require_auth().",
		xp: 100,
		needsTrustline: true,
		guided: true,
	},
	{
		id: 2,
		slug: "02-crown",
		category: "Auth",
		difficulty: 1,
		name: "Crown",
		story:
			"The contract crowned its admin on day one. Nobody thought to check whether the coronation could happen twice.",
		goal: "Become the admin.",
		hint: "One-time setup is only one-time if the code says so. What happens if you call initialize yourself?",
		xp: 200,
		needsTrustline: true,
		walletSigns: true,
	},
	{
		id: 3,
		slug: "03-wrong-signer",
		category: "Auth",
		difficulty: 2,
		name: "Wrong Signer",
		story:
			"A tiny ledger lets you withdraw on behalf of an account. It checks your signature very carefully. Just not against the right account.",
		goal: "Move the victim's balance to yourself.",
		hint: "withdraw_for authenticates the caller, but whose balance does it debit? Authenticating someone is not authenticating the owner.",
		xp: 300,
	},
	{
		id: 4,
		slug: "04-fatal-cast",
		category: "Arithmetic",
		difficulty: 2,
		name: "Fatal Cast",
		story:
			"Rewards are capped at 100. The developer double-checked the comparison, and the comparison is fine.",
		goal: "Credit yourself more than 1,000,000.",
		hint: "`as u32` never panics: it keeps the low 32 bits and drops the rest. Which i128 looks small once truncated?",
		xp: 400,
		walletSigns: true,
	},
	{
		id: 5,
		slug: "05-forgetful-list",
		category: "Storage",
		difficulty: 2,
		name: "Forgetful List",
		story:
			"You've been banned. The ban list is written down, but in ink that fades.",
		goal: "Perform the protected action while banned.",
		hint: "Temporary storage has a time-to-live. What is the ban list worth once its entry expires?",
		xp: 500,
		bonus: true,
		timed: true,
		walletSigns: true,
	},
	{
		id: 6,
		slug: "06-counterfeit",
		category: "Cross-contract",
		difficulty: 3,
		name: "Counterfeit",
		story:
			"The vault gives you credit for whatever token you hand over. It never asked where the token came from, only whether the transfer went through.",
		goal: "Empty the vault.",
		hint: "In Soroban, every address can be a contract, and you can write one. What does the vault do with the token address you give it? Who decides what its transfer does?",
		xp: 600,
		needsTrustline: true,
	},
	{
		id: 7,
		slug: "07-negative-space",
		category: "Arithmetic",
		difficulty: 1,
		name: "Negative Space",
		story:
			"A treasury and a ledger of points. Sending checks that you can afford it. It never asks whether the amount makes sense.",
		goal: "Take the treasury's points for yourself.",
		hint: "What does send do with an amount below zero? Follow the two balances: who ends up with more, and who signed for it?",
		xp: 150,
		walletSigns: true,
	},
	{
		id: 8,
		slug: "08-name-clash",
		category: "Storage",
		difficulty: 2,
		name: "Name Clash",
		story:
			"Anyone may register a delegate under a name of their choosing. The contract keeps its own secrets in the same drawer.",
		goal: "Become the admin.",
		hint: "Where does add_delegate write, and where does the contract keep its admin? Storage keys are just values: what if a name equals one of them?",
		xp: 350,
	},
	{
		id: 9,
		slug: "09-time-warp",
		category: "Logic",
		difficulty: 2,
		name: "Time Warp",
		story:
			"A savings vault locked for two months. The author tested the lock carefully, on a brand new local network.",
		goal: "Empty the vault, without waiting.",
		hint: "Compare the two sides of the lock check. One is a ledger number, the other is a timestamp. What unit is each in, and how big is it?",
		xp: 350,
		needsTrustline: true,
		walletSigns: true,
	},
]

export const levels: Level[] = LEVELS.map((level) => ({
	...level,
	source: sourceFor(level.slug),
}))

export const getLevel = (id: number) => levels.find((l) => l.id === id)

export const pad = (id: number) => id.toString().padStart(2, "0")
