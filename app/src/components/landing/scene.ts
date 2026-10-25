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
const CAMERA_START = 17
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

/**
 * The Stellar Lumens (XLM) coin: a solid disc with the Stellar mark cut out
 * of it. The outline is the public XLM icon from the cryptocurrency-icons set
 * (32x32 viewBox), drawn once on a canvas and shared by every coin.
 */
const XLM_PATH =
	"M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm7.13-22.708l-2.4 1.224-11.598 5.907A6.909 6.909 0 0119.35 9.498l1.374-.7.205-.105a8.439 8.439 0 00-13.371 7.472 1.535 1.535 0 01-.834 1.484l-.725.37v1.724l2.134-1.088.691-.353.681-.347 12.226-6.23 1.374-.699 2.84-1.447V7.856L23.13 9.292zm2.816 2.012L10.201 19.32l-1.374.7L6 21.463v1.723l2.808-1.43 2.401-1.224 11.61-5.916a6.909 6.909 0 01-10.229 6.93l-.085.045-1.49.76a8.439 8.439 0 0013.372-7.475 1.536 1.536 0 01.833-1.483l.726-.37v-1.718z"

const coinTexture = () => {
	const size = 256
	const unit = size / 32

	// The mark alone: a full disc minus the icon (the icon is a disc with the
	// mark cut out of it), drawn upright (the sprite's vertical axis is flipped in the shader).
	const mark = document.createElement("canvas")
	mark.width = mark.height = size
	const m = mark.getContext("2d")!
	m.scale(unit, unit)
	m.fillStyle = "#fff"
	m.beginPath()
	m.arc(16, 16, 16, 0, Math.PI * 2)
	m.fill()
	m.globalCompositeOperation = "destination-out"
	m.fill(new Path2D(XLM_PATH))

	// A black coin with a thin green rim and the white mark on it
	const canvas = document.createElement("canvas")
	canvas.width = canvas.height = size
	const ctx = canvas.getContext("2d")!
	ctx.fillStyle = "#02100a"
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
	ctx.fill()
	ctx.strokeStyle = "#00c83a"
	ctx.lineWidth = 7
	ctx.stroke()
	ctx.drawImage(mark, size * 0.1, size * 0.1, size * 0.8, size * 0.8)

	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.generateMipmaps = true
	texture.minFilter = THREE.LinearMipmapLinearFilter
	return texture
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

	// ── Drain: coins tumbling out of the wallet ───────────────────────────
	const count = opts.lowPower ? 30 : 70
	const seeds = new Float32Array(count * 4)
	for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
	const drainGeometry = new THREE.BufferGeometry()
	drainGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(new Float32Array(count * 3), 3),
	)
	drainGeometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 4))
	const coin = coinTexture()
	const uniforms = {
		uTime: { value: 0 },
		uScale: { value: 300 },
		uMap: { value: coin },
	}
	const drainMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms,
		vertexShader: /* glsl */ `
			attribute vec4 seed;
			uniform float uTime;
			uniform float uScale;
			varying float vAlpha;
			varying float vSpin;
			varying float vTilt;
			void main() {
				float t = fract(seed.x + uTime * (0.1 + 0.06 * seed.y));
				vec3 p;
				// Thrown out from inside the wallet, over its flap, then falling
				float side = seed.z - 0.5;
				p.x = side * (2.0 + 30.0 * t) * (0.55 + 0.45 * seed.y);
				p.y = 0.3 + 14.0 * t - 22.0 * t * t;
				p.z = (seed.w - 0.5) * 1.6;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * mv;
				// Pops up small from inside the wallet and grows as it leaves
				float grow = smoothstep(0.0, 0.14, t);
				gl_PointSize = (1.0 + 0.8 * seed.y) * uScale / -mv.z * (0.35 + 0.65 * grow);
				// Coins falling through the title's column vanish; the ones spilling to the sides keep going
				float below = smoothstep(-2.1, -3.2, p.y);
				float centre = 1.0 - smoothstep(5.5, 10.0, abs(p.x));
				vAlpha = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.62, 0.95, t)) * (1.0 - below * centre);
				vSpin = uTime * (1.2 + 1.8 * seed.y) + seed.w * 6.2831;
				vTilt = (seed.z - 0.5) * 0.7;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMap;
			varying float vAlpha;
			varying float vSpin;
			varying float vTilt;
			void main() {
				// gl_PointCoord's y axis points down, a canvas texture's points up
				vec2 uv = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);
				// In-plane tilt, then a flip around the vertical axis
				float c = cos(vTilt), s = sin(vTilt);
				uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
				float flip = max(0.12, abs(cos(vSpin)));
				uv.x /= flip;
				if (abs(uv.x) > 0.5 || abs(uv.y) > 0.5) discard;
				vec4 tex = texture2D(uMap, uv + 0.5);
				gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
			}
		`,
	})
	const drain = new THREE.Points(drainGeometry, drainMaterial)
	drain.frustumCulled = false
	scene.add(drain)

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
			lerp(4.0, 0, clamp01(progress / 0.19)) + Math.sin(time * 0.8) * 0.12
		// The coins pour out of wherever the wallet currently is
		wallet.scale.setScalar(lerp(0.88, 1, clamp01(progress / 0.19)))
		drain.position.y = wallet.position.y
		drain.visible = progress < 0.22
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
			coin.dispose()
			drainMaterial.dispose()
			ringMaterial.dispose()
			composer?.dispose()
			renderer.dispose()
		},
	}
}
