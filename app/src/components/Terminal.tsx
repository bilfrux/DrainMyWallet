import { type ReactNode } from "react"
import styles from "./Terminal.module.css"

interface TerminalProps {
	title: string
	children: ReactNode
	tone?: "default" | "danger" | "success"
	className?: string
}

/** A terminal window frame: title bar with traffic lights, then content. */
const Terminal = ({
	title,
	children,
	tone = "default",
	className = "",
}: TerminalProps) => (
	<section className={`${styles.terminal} ${styles[tone]} ${className}`}>
		<header className={styles.bar}>
			<span className={styles.dots} aria-hidden="true">
				<i />
				<i />
				<i />
			</span>
			<span className={styles.title}>{title}</span>
		</header>
		<div className={styles.body}>{children}</div>
	</section>
)

export default Terminal
