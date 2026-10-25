/** Public repo, linked from every page (trust signal, see SPEC §6). */
export const REPO_URL =
	(import.meta.env.PUBLIC_REPO_URL as string | undefined) ??
	"https://github.com/bilfrux/DrainMyWallet"
