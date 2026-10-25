import { fundAccount } from "@stellar-scaffold/app-lib"
import React, { useTransition } from "react"
import { useNotification } from "../hooks/useNotification.ts"
import { useWallet } from "../hooks/useWallet.ts"

interface FundAccountButtonProps {
	/** What to show once the account already holds XLM: nothing, or a short note */
	whenFunded?: "hide" | "note"
}

const FundAccountButton: React.FC<FundAccountButtonProps> = ({
	whenFunded = "hide",
}) => {
	const { addNotification } = useNotification()
	const [isPending, startTransition] = useTransition()
	const { address, balances, updateBalances } = useWallet()

	if (!address) return null

	// Friendbot only funds an address once, so there is nothing left to click
	if (balances.xlm) {
		return whenFunded === "note" ? (
			<p style={{ margin: 0 }}>✓ Your account already has test XLM.</p>
		) : null
	}

	const handleFundAccount = () => {
		startTransition(async () => {
			const { ok, message } = await fundAccount(address)
			if (ok) await updateBalances()
			addNotification(message, ok ? "success" : "error")
		})
	}

	return (
		<button
			disabled={isPending}
			onClick={handleFundAccount}
			title="Fund your account with test XLM via Friendbot"
		>
			Fund Account
		</button>
	)
}

export default FundAccountButton
