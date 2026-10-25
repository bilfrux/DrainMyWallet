import { type ReactNode } from "react"
import styles from "./SourceView.module.css"

const KEYWORDS = new Set(
	"as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(
		" ",
	),
)

// One alternation, tried left to right: comment, string, attribute, macro,
// number, identifier. Anything else falls through as plain text.
const TOKEN =
	/(\/\/.*)|("(?:[^"\\]|\\.)*")|(#!?\[[^\]]*\])|([a-z_][a-z0-9_]*!)|(\b\d[\d_]*(?:[iu](?:8|16|32|64|128|size))?\b)|([A-Za-z_][A-Za-z0-9_]*)/g

const highlight = (line: string): ReactNode[] => {
	const out: ReactNode[] = []
	let last = 0
	for (const m of line.matchAll(TOKEN)) {
		const index = m.index
		if (index > last) out.push(line.slice(last, index))
		const [text, comment, string, attr, macro, number, ident] = m
		const cls = comment
			? styles.comment
			: string
				? styles.string
				: attr
					? styles.attr
					: macro
						? styles.macro
						: number
							? styles.number
							: ident && KEYWORDS.has(ident)
								? styles.keyword
								: ident && /^[A-Z]/.test(ident)
									? styles.type
									: undefined
		out.push(
			cls ? (
				<span key={index} className={cls}>
					{text}
				</span>
			) : (
				text
			),
		)
		last = index + text.length
	}
	if (last < line.length) out.push(line.slice(last))
	return out
}

/** Read-only Rust source with line numbers and terminal-green highlighting. */
const SourceView = ({ source }: { source: string }) => {
	const lines = source.replace(/\n$/, "").split("\n")
	return (
		<pre className={styles.source}>
			<code>
				{lines.map((line, i) => (
					<span key={i} className={styles.line}>
						<span className={styles.gutter} aria-hidden="true">
							{i + 1}
						</span>
						<span>{highlight(line)}</span>
						{"\n"}
					</span>
				))}
			</code>
		</pre>
	)
}

export default SourceView
