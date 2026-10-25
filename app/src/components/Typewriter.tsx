import { useEffect, useState } from "react"

const reduceMotion = () =>
	window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Types `text` out one character at a time, with a blinking cursor. */
const Typewriter = ({
	text,
	speedMs = 18,
	className = "",
}: {
	text: string
	speedMs?: number
	className?: string
}) => {
	const [count, setCount] = useState(() => (reduceMotion() ? text.length : 0))

	useEffect(() => {
		if (reduceMotion()) {
			setCount(text.length)
			return
		}
		setCount(0)
		const id = setInterval(() => {
			setCount((c) => {
				if (c >= text.length) clearInterval(id)
				return Math.min(c + 1, text.length)
			})
		}, speedMs)
		return () => clearInterval(id)
	}, [text, speedMs])

	return (
		<span className={className}>
			{/* Full text for screen readers, typed text for the eyes */}
			<span className="sr-only">{text}</span>
			<span aria-hidden="true">{text.slice(0, count)}</span>
			{count < text.length && <span className="cursor" aria-hidden="true" />}
		</span>
	)
}

export default Typewriter
