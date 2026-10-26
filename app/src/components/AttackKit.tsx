import styles from "./AttackKit.module.css"
import CopyBlock from "./guide/CopyBlock"

/**
 * The commands a player needs to attack their instance, ready to paste: which
 * key to use (levels that count the wallet's own account need its secret in
 * the CLI, the others work with a throwaway key), then how to list the
 * contract's functions and call one. The site never runs any of it.
 */
const AttackKit = ({
	instanceId,
	address,
	walletSigns,
}: {
	instanceId: string
	address: string
	walletSigns: boolean
}) => (
	<div className={styles.kit}>
		<p className={styles.label}>attack from your terminal</p>

		<p className={styles.step}>
			<span>1</span>
			{walletSigns ? (
				<>
					Put the key of <code>{address}</code> in the CLI. This level only
					counts what that account does. Use a testnet-only account, and paste
					its secret when asked:
				</>
			) : (
				<>Create a throwaway attacker key, funded with free test XLM:</>
			)}
		</p>
		<CopyBlock
			text={
				walletSigns
					? "stellar keys add me --secret-key"
					: "stellar keys generate me --network testnet --fund"
			}
		/>

		<p className={styles.step}>
			<span>2</span>List what the contract exposes:
		</p>
		<CopyBlock
			text={`stellar contract invoke \\
  --id ${instanceId} \\
  --source-account me --network testnet \\
  -- --help`}
		/>

		<p className={styles.step}>
			<span>3</span>Ask a function what it expects, then call it:
		</p>
		<CopyBlock
			text={`stellar contract invoke \\
  --id ${instanceId} \\
  --source-account me --network testnet \\
  -- <function> --help`}
		/>

		<p className={styles.note}>
			Amounts are in the smallest unit: for LOOT, 1 token is 10,000,000. A
			negative number needs the equals sign, as in <code>--amount=-5</code>.
		</p>
	</div>
)

export default AttackKit
