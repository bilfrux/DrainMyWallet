import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import styles from "./Landing3D.module.css"
import { FLASH_AT, FLASH_WIDTH, type LandingScene } from "./scene"

interface Chapter {
	id: string
	kicker: string
	title: string
	body: string
	/** Visible while the scroll progress is within [from, to] */
	from: number
	to: number
	side: "center" | "left" | "right"
	/** Fade length in scroll progress; defaults to FADE */
	fade?: number
}

const CHAPTERS: Chapter[] = [
	{
		id: "intro",
		kicker: "root@meridian:~# ./wargame --network testnet",
		title: "DRAIN MY WALLET",
		body: "A security wargame for Soroban. Break real smart contracts, on testnet, with nothing to lose.",
		from: -1,
		to: 0.1,
		side: "center",
	},
	{
		id: "idea",
		kicker: "01 / THE IDEA",
		title: "Every level is a broken contract.",
		body: "Each one hides exactly one bug, the kind that really ships to production. Your job is to find it, then drain it.",
		from: 0.14,
		to: 0.27,
		side: "left",
	},
	{
		id: "instance",
		kicker: "02 / YOUR OWN COPY",
		title: "You get a private instance.",
		body: "One click deploys a fresh copy of the level on Stellar testnet, just for you. Break it as hard as you like: nobody else's game is affected.",
		from: 0.31,
		to: 0.44,
		side: "right",
	},
	{
		id: "break",
		kicker: "03 / BREAK IT",
		title: "Attack from your terminal.",
		body: "Read the code, spot the flaw, exploit it yourself with the Stellar CLI. The site never signs an exploit for you.",
		from: 0.48,
		to: 0.61,
		side: "left",
	},
	{
		id: "proof",
		kicker: "04 / PROOF",
		title: "The chain checks your win.",
		body: "Press Check: the contract verifies it on-chain and mints $DRAIN XP. One reward per level, and you can't fake it or transfer it.",
		from: 0.64,
		to: 0.73,
		side: "center",
	},
	{
		id: "grant",
		kicker: "// vault.lock --release",
		title: "ACCESS GRANTED",
		body: "",
		from: 0.83,
		to: 0.905,
		side: "center",
		fade: 0.015,
	},
	{
		id: "final",
		kicker: "05 / YOUR TURN",
		title: "Six broken contracts are waiting.",
		body: "Start with a guided level, or go straight to the list. Everything here runs on testnet: nothing real is at stake.",
		from: 0.95,
		to: 2,
		side: "center",
	},
]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const FADE = 0.03

const webglAvailable = () => {
	try {
		const canvas = document.createElement("canvas")
		return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
	} catch {
		return false
	}
}

const shouldAnimate = () =>
	!window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
	webglAvailable()

/**
 * The home page's scroll-driven 3D intro. The stage is sticky while the user
 * scrolls through a tall section; scroll progress flies the camera through a
 * neon wallet and a tunnel, and the text chapters fade in and out in sync.
 * Reduced motion, or no WebGL, gets the same story as plain stacked cards.
 */
const Landing3D = () => {
	const navigate = useNavigate()
	const sectionRef = useRef<HTMLElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chapterRefs = useRef<(HTMLDivElement | null)[]>([])
	const dotRefs = useRef<(HTMLButtonElement | null)[]>([])
	const hintRef = useRef<HTMLDivElement>(null)
	const barRef = useRef<HTMLDivElement>(null)
	const flashRef = useRef<HTMLDivElement>(null)
	const enterRef = useRef<HTMLButtonElement>(null)
	const [animated] = useState(shouldAnimate)
	const [loading, setLoading] = useState(animated)

	useEffect(() => {
		if (!animated) return
		const section = sectionRef.current
		const canvas = canvasRef.current
		if (!section || !canvas) return

		let scene: LandingScene | undefined
		let cancelled = false
		let target = 0
		let shown = 0
		let raf = 0

		const readScroll = () => {
			const rect = section.getBoundingClientRect()
			const span = rect.height - window.innerHeight
			target = clamp01(-rect.top / Math.max(1, span))
		}

		const paint = (p: number) => {
			CHAPTERS.forEach((c, i) => {
				const el = chapterRefs.current[i]
				if (!el) return
				const fade = c.fade ?? FADE
				const enter = clamp01((p - c.from) / fade)
				const leave = clamp01((c.to - p) / fade)
				const visible = enter * leave
				// Text flies in from depth and out past the viewer
				const scale = 0.9 + 0.1 * enter + (1 - leave) * 0.14
				const lift = (1 - enter) * 36 - (1 - leave) * 36
				el.style.opacity = String(visible)
				el.style.transform = `translate3d(0, ${lift}px, 0) scale(${scale})`
				el.style.filter = visible < 1 ? `blur(${(1 - visible) * 6}px)` : "none"
				el.style.pointerEvents = visible > 0.6 ? "auto" : "none"
				el.style.visibility = visible > 0.01 ? "visible" : "hidden"
			})
			dotRefs.current.forEach((dot, i) => {
				const c = CHAPTERS[i]
				if (!dot || !c) return
				const next = CHAPTERS[i + 1]
				const on =
					p >= Math.max(0, c.from) - 0.02 && (!next || p < next.from - 0.02)
				dot.dataset.on = on ? "1" : "0"
			})
			if (hintRef.current)
				hintRef.current.style.opacity = String(1 - clamp01(p / 0.04))
			if (flashRef.current) {
				const f = clamp01(1 - Math.abs(p - FLASH_AT) / FLASH_WIDTH)
				flashRef.current.style.opacity = String(f * f)
			}
			if (barRef.current) barRef.current.style.transform = `scaleY(${p})`
			// The floating button takes over once the hero's own button scrolls away
			if (enterRef.current) {
				const v = clamp01((p - 0.05) / 0.05) * clamp01((0.86 - p) / 0.03)
				enterRef.current.style.opacity = String(v)
				enterRef.current.style.pointerEvents = v > 0.5 ? "auto" : "none"
			}
		}

		const tick = () => {
			raf = requestAnimationFrame(tick)
			shown += (target - shown) * 0.09
			if (Math.abs(target - shown) < 0.0002) shown = target
			scene?.setProgress(shown)
			paint(shown)
		}

		const onPointer = (e: PointerEvent) =>
			scene?.setPointer(
				(e.clientX / window.innerWidth - 0.5) * 2,
				-(e.clientY / window.innerHeight - 0.5) * 2,
			)

		const onResize = () => {
			const stage = canvas.parentElement
			if (stage) scene?.resize(stage.clientWidth, stage.clientHeight)
			readScroll()
		}

		// Only burn GPU while the section is on screen
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry) return
			if (entry.isIntersecting) scene?.start()
			else scene?.stop()
		})

		void import("./scene")
			.then(({ createLandingScene }) => {
				if (cancelled) return
				scene = createLandingScene(canvas, {
					lowPower:
						window.innerWidth < 760 ||
						(navigator.hardwareConcurrency ?? 8) <= 4,
				})
				onResize()
				observer.observe(section)
				setLoading(false)
			})
			.catch((e) => {
				console.error("3D intro failed to start", e)
				setLoading(false)
			})

		readScroll()
		shown = target
		raf = requestAnimationFrame(tick)
		window.addEventListener("scroll", readScroll, { passive: true })
		window.addEventListener("resize", onResize)
		window.addEventListener("pointermove", onPointer, { passive: true })

		return () => {
			cancelled = true
			cancelAnimationFrame(raf)
			observer.disconnect()
			window.removeEventListener("scroll", readScroll)
			window.removeEventListener("resize", onResize)
			window.removeEventListener("pointermove", onPointer)
			scene?.dispose()
		}
	}, [animated])

	const jumpTo = (index: number) => {
		const section = sectionRef.current
		const c = CHAPTERS[index]
		if (!section || !c) return
		const span = section.offsetHeight - window.innerHeight
		const p =
			c.from < 0
				? 0
				: c.to > 1
					? Math.min(0.995, c.from + 0.02)
					: (c.from + c.to) / 2
		window.scrollTo({
			top: section.offsetTop + span * p,
			behavior: "smooth",
		})
	}

	const enter = () => navigate("/play")

	const chapterBody = (c: Chapter) => (
		<>
			<p className={styles.kicker}>{c.kicker}</p>
			{c.id === "intro" ? (
				<h1 className={styles.hero} data-text={c.title}>
					{c.title}
				</h1>
			) : (
				<h2
					className={`${styles.title} ${c.id === "grant" ? styles.grant : ""}`}
				>
					{c.title}
				</h2>
			)}
			{c.body && <p className={styles.body}>{c.body}</p>}
			{c.id === "intro" && (
				<div className={styles.actions}>
					<button className={styles.cta} onClick={enter}>
						Enter the game ▸
					</button>
					<button className={styles.ghost} onClick={() => jumpTo(1)}>
						how it works ↓
					</button>
				</div>
			)}
			{c.id === "break" && (
				<pre className={styles.snippet}>
					{`$ stellar contract invoke --id C…YOURS \\
    -- withdraw --amount 1000
`}
					<span className={styles.ok}>✓ vault emptied</span>
				</pre>
			)}
			{c.id === "final" && (
				<div className={styles.actions}>
					<button className={styles.cta} onClick={enter}>
						Enter the game ▸
					</button>
					<Link to="/level/1" className={styles.ghost}>
						or start with level 01 →
					</Link>
				</div>
			)}
		</>
	)

	if (!animated) {
		return (
			<section className={styles.fallback} aria-label="Introduction">
				{CHAPTERS.map((c) => (
					<div key={c.id} className={styles.card}>
						{chapterBody(c)}
					</div>
				))}
			</section>
		)
	}

	return (
		<section
			ref={sectionRef}
			className={styles.section}
			aria-label="Introduction"
		>
			<div className={styles.stage}>
				<canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
				<div className={styles.vignette} aria-hidden="true" />
				<div ref={flashRef} className={styles.flash} aria-hidden="true" />
				{loading && <p className={styles.loading}>booting renderer…</p>}

				{CHAPTERS.map((c, i) => (
					<div
						key={c.id}
						ref={(el) => {
							chapterRefs.current[i] = el
						}}
						className={`${styles.chapter} ${styles[c.side]} ${c.id === "intro" ? styles.bottom : ""} ${c.id === "grant" ? styles.grantChapter : ""}`}
						style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
					>
						<div className={styles.panel}>{chapterBody(c)}</div>
					</div>
				))}

				<div ref={hintRef} className={styles.scrollHint} aria-hidden="true">
					<span>scroll</span>
					<i />
				</div>

				<nav className={styles.dots} aria-label="Chapters">
					<div className={styles.track}>
						<div ref={barRef} className={styles.bar} />
					</div>
					{CHAPTERS.map((c, i) => (
						<button
							key={c.id}
							ref={(el) => {
								dotRefs.current[i] = el
							}}
							aria-label={c.kicker}
							title={c.kicker}
							onClick={() => jumpTo(i)}
						/>
					))}
				</nav>

				<button ref={enterRef} className={styles.enter} onClick={enter}>
					Enter the game ▸
				</button>
			</div>
		</section>
	)
}

export default Landing3D
