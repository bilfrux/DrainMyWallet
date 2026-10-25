import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"

/**
 * The scroll-driven 3D scene of the home page: a neon wireframe wallet that
 * drains into a stream of glyphs, a tunnel the camera dives through, and a
 * vault door waiting at the end. `setProgress(0..1)` moves the camera along
 * the path; everything else animates on its own clock.
 */
export interface LandingScene {
	setProgress: (p: number) => void
	setPointer: (x: number, y: number) => void
	resize: (width: number, height: number) => void
	start: () => void
	stop: () => void
	dispose: () => void
}

const GREEN = 0x00ff41
const CAMERA_START = 21
const CAMERA_END = -72
const DOOR_Z = -90

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Thick neon lines: plain WebGL lines are always 1px wide. */
const fatLines = (
	segments: THREE.BufferGeometry,
	material: LineMaterial,
): LineSegments2 => {
	const geometry = new LineSegmentsGeometry().fromEdgesGeometry(
		segments as THREE.EdgesGeometry,
	)
	return new LineSegments2(geometry, material)
}

const circlePoints = (radius: number, steps: number, z = 0) => {
	const points: number[] = []
	for (let i = 0; i < steps; i++) {
		const a0 = (i / steps) * Math.PI * 2
		const a1 = ((i + 1) / steps) * Math.PI * 2
		points.push(
			Math.cos(a0) * radius,
			Math.sin(a0) * radius,
			z,
			Math.cos(a1) * radius,
			Math.sin(a1) * radius,
			z,
		)
	}
	return points
}

const segmentsOf = (points: number[]) => {
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(points)
	return geometry
}

export const createLandingScene = (
	canvas: HTMLCanvasElement,
	opts: { lowPower: boolean },
): LandingScene => {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: !opts.lowPower,
		powerPreference: "high-performance",
	})
	renderer.setPixelRatio(
		Math.min(window.devicePixelRatio, opts.lowPower ? 1.5 : 2),
	)
	renderer.setClearColor(0x000802, 1)

	const scene = new THREE.Scene()
	scene.fog = new THREE.FogExp2(0x000802, 0.017)
	const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
	camera.position.set(0, 0, CAMERA_START)

	const lineMaterials: LineMaterial[] = []
	const neon = (width: number, opacity = 1) => {
		const material = new LineMaterial({
			color: GREEN,
			linewidth: width,
			transparent: true,
			opacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			fog: true,
		})
		lineMaterials.push(material)
		return material
	}

	// ── Wallet ────────────────────────────────────────────────────────────
	const wallet = new THREE.Group()
	const body = new THREE.BoxGeometry(6, 3.8, 1.2)
	wallet.add(fatLines(new THREE.EdgesGeometry(body), neon(3.4)))
	// A second, wider and fainter pass: cheap halo before the bloom
	const halo = fatLines(new THREE.EdgesGeometry(body), neon(6, 0.07))
	wallet.add(halo)
	wallet.add(
		fatLines(
			new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.15, 1.4)).translate(
				2.5,
				-0.15,
				0,
			),
			neon(3.4),
		),
	)
	// Flap and the `>_` prompt, on the front face
	const front = 0.62
	wallet.add(
		new LineSegments2(
			segmentsOf([
				-3,
				1.0,
				front,
				3,
				1.0,
				front,
				-2.3,
				0.35,
				front,
				-1.5,
				-0.1,
				front,
				-1.5,
				-0.1,
				front,
				-2.3,
				-0.55,
				front,
				-1.05,
				-0.65,
				front,
				-0.1,
				-0.65,
				front,
			]),
			neon(3.4),
		),
	)
	scene.add(wallet)

	// ── Drain: glyphs pouring out of the wallet ───────────────────────────
	const count = opts.lowPower ? 1400 : 4200
	const seeds = new Float32Array(count * 4)
	for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
	const drainGeometry = new THREE.BufferGeometry()
	drainGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(new Float32Array(count * 3), 3),
	)
	drainGeometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 4))
	const uniforms = { uTime: { value: 0 }, uScale: { value: 300 } }
	const drainMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms,
		vertexShader: /* glsl */ `
			attribute vec4 seed;
			uniform float uTime;
			uniform float uScale;
			varying float vAlpha;
			void main() {
				float t = fract(seed.x + uTime * (0.07 + 0.12 * seed.y));
				vec3 p;
				p.x = (seed.z - 0.5) * 5.4 * (1.0 - 0.55 * t) + sin(uTime * 0.7 + seed.w * 20.0) * 0.18 * t;
				p.y = -1.9 - t * 13.0;
				p.z = (seed.w - 0.5) * 1.0 * (1.0 + t * 2.0);
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * mv;
				gl_PointSize = (0.05 + 0.1 * seed.y) * uScale / -mv.z * (1.0 - 0.5 * t);
				vAlpha = smoothstep(0.0, 0.04, t) * (1.0 - t);
			}
		`,
		fragmentShader: /* glsl */ `
			varying float vAlpha;
			void main() {
				vec2 c = abs(gl_PointCoord - 0.5);
				if (max(c.x, c.y) > 0.5) discard;
				// A glyph-ish square with a hollow centre
				float edge = step(0.18, max(c.x, c.y));
				gl_FragColor = vec4(0.05, 1.0, 0.05, vAlpha * 0.5 * (0.45 + 0.55 * edge));
			}
		`,
	})
	scene.add(new THREE.Points(drainGeometry, drainMaterial))

	// ── Tunnel ───────────────────────────────────────────────────────────
	const rings = new THREE.Group()
	const ringCount = 26
	const ringGeometry = new THREE.BufferGeometry().setFromPoints(
		[
			[-4.6, -4.6],
			[4.6, -4.6],
			[4.6, 4.6],
			[-4.6, 4.6],
		].map(([x, y]) => new THREE.Vector3(x, y, 0)),
	)
	const ringMaterial = new THREE.LineBasicMaterial({
		color: GREEN,
		transparent: true,
		opacity: 0.75,
		blending: THREE.AdditiveBlending,
	})
	for (let i = 0; i < ringCount; i++) {
		const ring = new THREE.LineLoop(ringGeometry, ringMaterial)
		ring.position.z = -7 - i * 3.2
		ring.rotation.z = i * 0.21
		rings.add(ring)
	}
	scene.add(rings)

	// Glyph dust drifting along the tunnel walls
	const dustCount = opts.lowPower ? 700 : 2200
	const dust = new Float32Array(dustCount * 3)
	for (let i = 0; i < dustCount; i++) {
		const a = Math.random() * Math.PI * 2
		const r = 3 + Math.random() * 9
		dust[i * 3] = Math.cos(a) * r
		dust[i * 3 + 1] = Math.sin(a) * r
		dust[i * 3 + 2] = -6 - Math.random() * 84
	}
	const dustGeometry = new THREE.BufferGeometry()
	dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3))
	const dustPoints = new THREE.Points(
		dustGeometry,
		new THREE.PointsMaterial({
			color: GREEN,
			size: 0.12,
			transparent: true,
			opacity: 0.7,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		}),
	)
	scene.add(dustPoints)

	// ── Vault door ───────────────────────────────────────────────────────
	const door = new THREE.Group()
	door.position.z = DOOR_Z
	const wheel = new THREE.Group()
	for (const [radius, z, width] of [
		[9, 0, 4],
		[7.4, -0.7, 2.6],
		[5.4, -1.4, 3],
		[2.1, -2.0, 4],
	] as const) {
		door.add(
			new LineSegments2(segmentsOf(circlePoints(radius, 72, z)), neon(width)),
		)
	}
	const spokes: number[] = []
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2
		spokes.push(
			Math.cos(a) * 2.1,
			Math.sin(a) * 2.1,
			-2.0,
			Math.cos(a) * 5.4,
			Math.sin(a) * 5.4,
			-1.4,
		)
	}
	wheel.add(new LineSegments2(segmentsOf(spokes), neon(3.4)))
	door.add(wheel)
	// Bolts around the rim
	const bolts: number[] = []
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * Math.PI * 2
		bolts.push(
			Math.cos(a) * 8.2,
			Math.sin(a) * 8.2,
			0,
			Math.cos(a) * 8.2,
			Math.sin(a) * 8.2,
			0.4,
		)
	}
	door.add(new LineSegments2(segmentsOf(bolts), neon(5)))
	scene.add(door)

	// ── Post-processing: bloom makes the lines glow ──────────────────────
	let composer: EffectComposer | undefined
	let bloom: UnrealBloomPass | undefined
	if (!opts.lowPower && !location.search.includes("nobloom")) {
		composer = new EffectComposer(renderer)
		composer.addPass(new RenderPass(scene, camera))
		bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.45, 0.22)
		composer.addPass(bloom)
		composer.addPass(new OutputPass())
	}

	// ── Animation ────────────────────────────────────────────────────────
	let progress = 0
	let pointerX = 0
	let pointerY = 0
	let raf = 0
	let running = false
	let last = performance.now()
	let time = 0

	const frame = (now: number) => {
		if (!running) return
		raf = requestAnimationFrame(frame)
		const dt = Math.min(0.05, (now - last) / 1000)
		last = now
		time += dt

		// The camera path: a slow approach, a dive through the wallet, then a
		// long flight down the tunnel. A little ease keeps the start gentle.
		const eased = lerp(progress, progress * progress * (3 - 2 * progress), 0.45)
		const z = lerp(CAMERA_START, CAMERA_END, eased)
		camera.position.x += (pointerX * 1.6 - camera.position.x) * 0.05
		camera.position.y += (pointerY * 1.0 - camera.position.y) * 0.05
		camera.position.z = z
		camera.rotation.z = Math.sin(time * 0.3) * 0.02 + eased * Math.PI * 0.35
		camera.lookAt(pointerX * 0.8, pointerY * 0.5, z - 20)

		wallet.rotation.y = Math.sin(time * 0.35) * 0.35 + progress * 2.4
		wallet.rotation.x = Math.sin(time * 0.27) * 0.08 - 0.12
		wallet.position.y =
			lerp(1.7, 0, clamp01(progress / 0.17)) + Math.sin(time * 0.8) * 0.12
		// The wallet fades once we are inside it
		const gone = clamp01((z - -2) / 10)
		wallet.visible = gone > 0.01 || z > -4
		halo.visible = gone > 0.2

		rings.children.forEach((ring, i) => {
			ring.rotation.z = i * 0.21 + time * 0.12 * (i % 2 ? 1 : -1)
		})
		wheel.rotation.z = time * 0.25 - progress * 4
		door.rotation.z = Math.sin(time * 0.15) * 0.05
		dustPoints.rotation.z = time * 0.02

		uniforms.uTime.value = time
		bloom &&
			(bloom.strength = 0.7 + 0.5 * Math.sin(time * 0.9) * 0.2 + progress * 0.5)

		if (composer) composer.render()
		else renderer.render(scene, camera)
	}

	return {
		setProgress: (p) => {
			progress = clamp01(p)
		},
		setPointer: (x, y) => {
			pointerX = x
			pointerY = y
		},
		resize: (width, height) => {
			renderer.setSize(width, height, false)
			composer?.setSize(width, height)
			camera.aspect = width / height
			camera.updateProjectionMatrix()
			const ratio = renderer.getPixelRatio()
			lineMaterials.forEach((m) =>
				m.resolution.set(width * ratio, height * ratio),
			)
			// pixels per world unit at distance 1, for a 55 degree field of view
			uniforms.uScale.value =
				(height * ratio * 0.5) / Math.tan((55 * Math.PI) / 360)
			bloom?.resolution.set(width, height)
		},
		start: () => {
			if (running) return
			running = true
			last = performance.now()
			raf = requestAnimationFrame(frame)
		},
		stop: () => {
			running = false
			cancelAnimationFrame(raf)
		},
		dispose: () => {
			running = false
			cancelAnimationFrame(raf)
			scene.traverse((object) => {
				const mesh = object as THREE.Mesh
				mesh.geometry?.dispose?.()
			})
			lineMaterials.forEach((m) => m.dispose())
			drainMaterial.dispose()
			ringMaterial.dispose()
			composer?.dispose()
			renderer.dispose()
		},
	}
}
