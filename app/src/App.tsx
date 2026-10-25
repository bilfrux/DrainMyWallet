import { Link, NavLink, Outlet, Route, Routes } from "react-router-dom"
import styles from "./App.module.css"
import ConnectAccount from "./components/ConnectAccount"
import MatrixRain from "./components/MatrixRain"
import NetworkGuard from "./components/NetworkGuard"
import TestnetBanner from "./components/TestnetBanner"
import XpCounter from "./components/XpCounter"
import { REPO_URL } from "./game/config"
import Home from "./pages/Home"
import Leaderboard from "./pages/Leaderboard"
import LevelPage from "./pages/Level"
import NotFound from "./pages/NotFound"

function App() {
	return (
		<Routes>
			<Route element={<AppLayout />}>
				<Route path="/" element={<Home />} />
				<Route path="/level/:id" element={<LevelPage />} />
				<Route path="/leaderboard" element={<Leaderboard />} />
				<Route path="*" element={<NotFound />} />
			</Route>
		</Routes>
	)
}

const navClass = ({ isActive }: { isActive: boolean }) =>
	isActive ? styles.active : ""

const AppLayout = () => (
	<div className={styles.AppLayout}>
		<MatrixRain />
		<TestnetBanner />

		<header className={styles.header}>
			<Link to="/" className={styles.logo}>
				<img src="/logo.svg" alt="" className={styles.logoMark} />
				<span className={styles.prompt}>&gt;</span> drain_my_wallet
				<span className="cursor" />
			</Link>
			<nav className={styles.headerNav}>
				<NavLink to="/" end className={navClass}>
					./levels
				</NavLink>
				<NavLink to="/leaderboard" className={navClass}>
					./leaderboard
				</NavLink>
				<a href={REPO_URL} target="_blank" rel="noreferrer">
					./source ↗
				</a>
			</nav>
			<XpCounter />
			<ConnectAccount />
		</header>

		<main className={styles.main}>
			<NetworkGuard>
				<Outlet />
			</NetworkGuard>
		</main>

		<footer className={styles.footer}>
			<span>
				A Soroban security wargame · built at HackMeridian, Lisbon 2026
			</span>
			<nav className={styles.footerNav}>
				<a href={REPO_URL} target="_blank" rel="noreferrer">
					GitHub
				</a>
				<a
					href="https://developers.stellar.org/docs/build/smart-contracts/overview"
					target="_blank"
					rel="noreferrer"
				>
					Soroban docs
				</a>
			</nav>
		</footer>
	</div>
)

export default App
