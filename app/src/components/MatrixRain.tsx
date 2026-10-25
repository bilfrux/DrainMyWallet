import { useEffect, useRef } from "react"
import styles from "./MatrixRain.module.css"

// Mostly digits, with a sprinkle of half-width katakana for the movie feel
const GLYPHS = "0123456789012345678901234567890123456789ｱｲｳｴｵｶｷｸｹｺ$#"
const FONT_SIZE = 16
const FRAME_MS = 1000 / 24

const randomGlyph = () =>
	GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length))

/**
 * Falling green digits behind the whole app. Draws on a canvas, fading each
 * frame with a translucent black fill so every column leaves a trail. Pauses
 * with the tab (requestAnimationFrame) and stays still for reduced motion.
 */
const MatrixRain = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext("2d")
		if (!canvas || !ctx) return

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches
		let drops: number[] = []
		let width = 0
		let height = 0

		const resize = () => {
			const dpr = window.devicePixelRatio || 1
			width = window.innerWidth
			height = window.innerHeight
			canvas.width = width * dpr
			canvas.height = height * dpr
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.fillStyle = "#000"
			ctx.fillRect(0, 0, width, height)
			const columns = Math.ceil(width / FONT_SIZE)
			// Start each column at a random height so the rain is already falling
			drops = Array.from(
				{ length: columns },
				(_, i) => drops[i] ?? Math.random() * -(height / FONT_SIZE),
			)
		}

		const draw = () => {
			ctx.fillStyle = "rgba(0, 0, 0, 0.08)"
			ctx.fillRect(0, 0, width, height)
			ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`

			drops.forEach((drop, i) => {
				const x = i * FONT_SIZE
				const y = drop * FONT_SIZE
				// Bright head, then the trail is left by the fade above
				ctx.fillStyle = Math.random() > 0.975 ? "#d6ffe0" : "#00ff41"
				ctx.fillText(randomGlyph(), x, y)

				drops[i] = y > height && Math.random() > 0.975 ? 0 : drop + 1
			})
		}

		resize()
		window.addEventListener("resize", resize)

		if (reduceMotion) {
			// A single settled frame: enough texture without any movement
			for (let i = 0; i < 60; i++) draw()
			return () => window.removeEventListener("resize", resize)
		}

		let frame = 0
		let last = 0
		const loop = (time: number) => {
			frame = requestAnimationFrame(loop)
			if (time - last < FRAME_MS) return
			last = time
			draw()
		}
		frame = requestAnimationFrame(loop)

		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", resize)
		}
	}, [])

	return (
		<>
			<canvas ref={canvasRef} className={styles.rain} aria-hidden="true" />
			<div className={styles.scanlines} aria-hidden="true" />
		</>
	)
}

export default MatrixRain
