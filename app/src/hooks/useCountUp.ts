import { useEffect, useRef, useState } from "react"

/** Animates a number from its previous value to `target` (ease-out). */
export const useCountUp = (target: number, durationMs = 1200) => {
	const [value, setValue] = useState(target)
	const from = useRef(target)

	useEffect(() => {
		const start = performance.now()
		const initial = from.current
		let frame = 0

		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / durationMs)
			const eased = 1 - Math.pow(1 - t, 3)
			const next = Math.round(initial + (target - initial) * eased)
			setValue(next)
			from.current = next
			if (t < 1) frame = requestAnimationFrame(tick)
		}
		frame = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame)
	}, [target, durationMs])

	return value
}
