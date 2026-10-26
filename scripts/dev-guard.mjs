import { execSync } from "node:child_process"

// Runs as the root `prestart` hook: `start` runs `stellar scaffold watch`, so
// check the required CLIs are installed and print install instructions if not.
const TOOLS = [
	{
		name: "Stellar CLI",
		check: "stellar --version",
		install: "cargo install --locked stellar-cli",
		binstall: "cargo binstall -y --locked stellar-cli",
		url: "https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli",
	},
	{
		name: "Stellar Scaffold CLI",
		check: "stellar scaffold --version",
		install: "cargo install --locked stellar-scaffold-cli",
		binstall: "cargo binstall -y --locked stellar-scaffold-cli",
		url: "https://github.com/stellar-scaffold/cli#quickstart-new-developers-welcome",
	},
]

function has(cmd) {
	try {
		execSync(cmd, { stdio: "ignore" })
		return true
	} catch {
		return false
	}
}

function toolInstructions() {
	const missing = TOOLS.filter((t) => !has(t.check))
	if (missing.length === 0) return ""
	const hasBinstall = has("cargo binstall --version")
	return [
		"",
		"Missing required tools:",
		...missing.flatMap((t) => [
			`  - ${t.name}`,
			`      ${hasBinstall ? t.binstall : t.install}`,
			`      docs: ${t.url}`,
		]),
	].join("\n")
}

const tools = toolInstructions()
if (tools) {
	console.error(
		`\nCannot start — install the required Stellar tools first:${tools}\n`,
	)
	process.exit(1)
}
