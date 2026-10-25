import { useState } from "react"
import styles from "./GuidedTour.module.css"

/** A command to copy: the player pastes it into their terminal. */
const CopyBlock = ({ text }: { text: string }) => {
	const [copied, setCopied] = useState(false)

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 1800)
		} catch {
			// Clipboard blocked: the command is still selectable on screen
		}
	}

	return (
		<div className={styles.copyBlock}>
			<pre>{text}</pre>
			<button onClick={() => void copy()} aria-label="Copy command">
				{copied ? "copied ✓" : "copy"}
			</button>
		</div>
	)
}

export default CopyBlock
