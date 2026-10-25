export interface Level {
	id: number
	/** Directory under `contracts/levels/` */
	slug: string
	name: string
	story: string
	goal: string
	hint: string
	xp: number
	bonus?: boolean
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
		name: "Open Door",
		story:
			"A vault holds 1,000 tokens behind a heavy steel door. The architect spent weeks on the deposit logic, and about five minutes on the way out.",
		goal: "Empty the vault.",
		hint: "Look at who is allowed to call withdraw. Then look again. In Soroban, nothing is protected unless someone calls require_auth().",
		xp: 100,
	},
	{
		id: 2,
		slug: "02-crown",
		name: "Crown",
		story:
			"The contract crowned its admin on day one. Nobody thought to check whether the coronation could happen twice.",
		goal: "Become the admin.",
		hint: "One-time setup is only one-time if the code says so. What happens if you call initialize yourself?",
		xp: 200,
	},
	{
		id: 3,
		slug: "03-wrong-signer",
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
		name: "Fatal Cast",
		story:
			"Rewards are capped at 100. The developer double-checked the comparison. The comparison is fine. The type is not.",
		goal: "Credit yourself more than 1,000,000.",
		hint: "`as u32` never panics: it keeps the low 32 bits and drops the rest. Which i128 looks small once truncated?",
		xp: 400,
	},
	{
		id: 5,
		slug: "05-forgetful-list",
		name: "Forgetful List",
		story:
			"You've been banned. The ban list is written down, but in ink that fades.",
		goal: "Perform the protected action while banned.",
		hint: "Temporary storage has a time-to-live. What is the ban list worth once its entry expires?",
		xp: 500,
		bonus: true,
	},
]

export const levels: Level[] = LEVELS.map((level) => ({
	...level,
	source: sourceFor(level.slug),
}))

export const getLevel = (id: number) => levels.find((l) => l.id === id)

export const pad = (id: number) => id.toString().padStart(2, "0")
