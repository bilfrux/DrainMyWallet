import styles from "./TestnetBanner.module.css"

/**
 * Permanent banner on every page (SPEC §6). A site called "drain my wallet"
 * that asks for a wallet connection must defuse the phishing reflex at once.
 */
const TestnetBanner = () => (
	<div className={styles.banner} role="note">
		<strong>⚠ EDUCATIONAL CTF</strong>
		<span>Stellar TESTNET only · no real funds</span>
		<span>
			This site only asks you to sign two things: create instance &amp; check
		</span>
	</div>
)

export default TestnetBanner
