import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

// Minimal ANSI colors without external dependencies
const isColorSupported =
	!("NO_COLOR" in process.env) &&
	(process.env.FORCE_COLOR !== "0" || process.stdout.isTTY);

const c = {
	bold: (s: string) => (isColorSupported ? `\x1b[1m${s}\x1b[22m` : s),
	dim: (s: string) => (isColorSupported ? `\x1b[2m${s}\x1b[22m` : s),
	underline: (s: string) => (isColorSupported ? `\x1b[4m${s}\x1b[24m` : s),
	red: (s: string) => (isColorSupported ? `\x1b[31m${s}\x1b[39m` : s),
	green: (s: string) => (isColorSupported ? `\x1b[32m${s}\x1b[39m` : s),
	yellow: (s: string) => (isColorSupported ? `\x1b[33m${s}\x1b[39m` : s),
	blue: (s: string) => (isColorSupported ? `\x1b[34m${s}\x1b[39m` : s),
	magenta: (s: string) => (isColorSupported ? `\x1b[35m${s}\x1b[39m` : s),
	cyan: (s: string) => (isColorSupported ? `\x1b[36m${s}\x1b[39m` : s),
};

const DEFAULT_HOST = process.env.SONAR_HOST_URL ?? "http://localhost:9000";
const DEFAULT_PROJECT_KEY = process.env.SONAR_PROJECT_KEY ?? "byos_next";
const DEFAULT_USERNAME = process.env.SONAR_USERNAME ?? "admin";
const DEFAULT_PASSWORD = process.env.SONAR_PASSWORD ?? "admin";

export interface SonarIssue {
	key: string;
	rule: string;
	severity: string;
	component: string;
	line?: number;
	message: string;
	type: string;
	effort?: string;
}

function getAuthHeader(token: string): Record<string, string> {
	const credentials = `${token}:`;
	return {
		Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
	};
}

function trimTrailingSlash(url: string): string {
	let end = url.length;
	while (end > 0 && url[end - 1] === "/") {
		end--;
	}
	return url.slice(0, end);
}

export async function readTokenFromProperties(
	propertiesPath = "sonar-project.properties",
): Promise<string | undefined> {
	try {
		const content = await fs.readFile(propertiesPath, "utf-8");
		const match = content.match(/^sonar\.token=(.+)$/m);
		if (match?.[1]?.trim()) {
			return match[1].trim();
		}
	} catch {
		// Ignore if file doesn't exist or cannot be read
	}
	return undefined;
}

export async function generateNewToken(
	host = DEFAULT_HOST,
	username = DEFAULT_USERNAME,
	password = DEFAULT_PASSWORD,
): Promise<string> {
	const url = `${trimTrailingSlash(host)}/api/user_tokens/generate?name=token-${Date.now()}`;
	const credentials = `${username}:${password}`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to generate SonarQube token (${response.status} ${response.statusText}): ${errorText}`,
		);
	}

	const data = (await response.json()) as { token: string };
	return data.token;
}

export async function syncTokenToProperties(
	token: string,
	propertiesPath = "sonar-project.properties",
): Promise<boolean> {
	try {
		const content = await fs.readFile(propertiesPath, "utf-8");
		const updated = content.replace(
			/^sonar\.token=.*$/m,
			`sonar.token=${token}`,
		);
		if (updated !== content) {
			await fs.writeFile(propertiesPath, updated, "utf-8");
			return true;
		}
	} catch {
		// Ignore properties sync errors
	}
	return false;
}

export async function resolveAuthToken(options: {
	token?: string;
	host?: string;
}): Promise<string> {
	if (options.token) {
		return options.token;
	}
	const token = await generateNewToken(options.host);
	await syncTokenToProperties(token);
	return token;
}

async function fetchSonarApi<T>(
	path: string,
	host: string,
	token: string,
): Promise<T> {
	const url = `${trimTrailingSlash(host)}${path}`;
	const response = await fetch(url, {
		headers: getAuthHeader(token),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`SonarQube API error (${response.status} ${response.statusText}): ${errorText}`,
		);
	}

	return response.json() as Promise<T>;
}

function getSeverityColor(severity: string) {
	if (severity === "BLOCKER" || severity === "CRITICAL") {
		return c.red;
	}
	if (severity === "MAJOR") {
		return c.magenta;
	}
	return c.yellow;
}

function formatIssueLine(issue: SonarIssue): string {
	const severityColor = getSeverityColor(issue.severity);
	const typeBadge = `[${issue.type}]`;
	const lineStr = issue.line ? `:${issue.line}` : "";
	const ruleBadge = c.dim(`(${issue.rule})`);
	return `  ${severityColor(issue.severity.padEnd(8))} ${c.dim(typeBadge)} ${c.blue(
		`Line ${lineStr || "N/A"}`,
	)}: ${issue.message} ${ruleBadge}`;
}

function printGroupedIssues(issues: SonarIssue[], project: string): void {
	const grouped = new Map<string, SonarIssue[]>();

	for (const issue of issues) {
		const file = issue.component.replace(`${project}:`, "");
		const list = grouped.get(file) ?? [];
		list.push(issue);
		grouped.set(file, list);
	}

	for (const [file, fileIssues] of grouped.entries()) {
		console.log(c.bold(c.underline(`\n📄 ${file} (${fileIssues.length})`)));
		for (const issue of fileIssues) {
			console.log(formatIssueLine(issue));
		}
	}
}

export async function getIssuesCommand(options: {
	project: string;
	host: string;
	token?: string;
	resolved: boolean;
	type?: string;
	severity?: string;
}) {
	const queryParams = new URLSearchParams({
		componentKeys: options.project,
		resolved: String(options.resolved),
		ps: "100",
	});

	if (options.type) queryParams.set("types", options.type);
	if (options.severity) queryParams.set("severities", options.severity);

	console.log(c.cyan(`\n🔍 Fetching SonarQube issues [${options.project}]...`));

	try {
		const token = await resolveAuthToken(options);
		const data = await fetchSonarApi<{
			total: number;
			issues: SonarIssue[];
		}>(`/api/issues/search?${queryParams.toString()}`, options.host, token);

		if (data.total === 0) {
			console.log(
				c.green(
					`\n✨ Zero ${options.resolved ? "resolved" : "open"} issues found! Everything clean.\n`,
				),
			);
			return;
		}

		console.log(c.yellow(`\nFound ${data.total} issue(s):`));
		printGroupedIssues(data.issues, options.project);
		console.log("");
	} catch (err) {
		console.error(
			c.red(
				`Error fetching issues: ${err instanceof Error ? err.message : err}`,
			),
		);
		process.exit(1);
	}
}

export async function getQualityGateCommand(options: {
	project: string;
	host: string;
	token?: string;
}) {
	console.log(
		c.cyan(`\n🛡️ Fetching Quality Gate status [${options.project}]...`),
	);

	try {
		const token = await resolveAuthToken(options);
		const data = await fetchSonarApi<{
			projectStatus: {
				status: "OK" | "WARN" | "ERROR" | "NONE";
				conditions?: Array<{
					status: "OK" | "WARN" | "ERROR";
					metricKey: string;
					comparator: string;
					errorThreshold?: string;
					actualValue?: string;
				}>;
			};
		}>(
			`/api/qualitygates/project_status?projectKey=${options.project}`,
			options.host,
			token,
		);

		const status = data.projectStatus.status;
		if (status === "OK") {
			console.log(c.bold(c.green("\n✅ Quality Gate Passed (Status: OK)\n")));
		} else {
			console.log(
				c.bold(c.red(`\n❌ Quality Gate Failed (Status: ${status})\n`)),
			);
		}

		if (
			data.projectStatus.conditions &&
			data.projectStatus.conditions.length > 0
		) {
			console.log(c.bold("Conditions:"));
			for (const cond of data.projectStatus.conditions) {
				const condColor = cond.status === "OK" ? c.green : c.red;
				console.log(
					`  ${condColor(cond.status.padEnd(5))} Metric: ${c.bold(cond.metricKey)} | Actual: ${cond.actualValue ?? "N/A"} | Threshold: ${cond.errorThreshold ?? "N/A"}`,
				);
			}
			console.log("");
		}
	} catch (err) {
		console.error(
			c.red(
				`Error fetching Quality Gate: ${err instanceof Error ? err.message : err}`,
			),
		);
		process.exit(1);
	}
}

export async function getMetricsCommand(options: {
	project: string;
	host: string;
	token?: string;
}) {
	console.log(c.cyan(`\n📊 Fetching Project Metrics [${options.project}]...`));

	const metricKeys = [
		"ncloc",
		"bugs",
		"vulnerabilities",
		"code_smells",
		"security_hotspots",
		"cognitive_complexity",
		"sqale_index",
		"duplicated_lines_density",
	].join(",");

	try {
		const token = await resolveAuthToken(options);
		const data = await fetchSonarApi<{
			component: {
				key: string;
				name: string;
				measures: Array<{
					metric: string;
					value: string;
				}>;
			};
		}>(
			`/api/measures/component?component=${options.project}&metricKeys=${metricKeys}`,
			options.host,
			token,
		);

		console.log(
			c.bold(`\nProject: ${data.component.name} (${data.component.key})`),
		);
		console.log("--------------------------------------------------");

		const measureMap = new Map<string, string>();
		for (const m of data.component.measures) {
			measureMap.set(m.metric, m.value);
		}

		const formatMetric = (name: string, key: string, suffix = "") => {
			const val = measureMap.get(key) ?? "0";
			return `  • ${name.padEnd(25)}: ${c.bold(c.cyan(val))}${suffix}`;
		};

		console.log(formatMetric("Lines of Code (NCLOC)", "ncloc"));
		console.log(formatMetric("Bugs", "bugs"));
		console.log(formatMetric("Vulnerabilities", "vulnerabilities"));
		console.log(formatMetric("Security Hotspots", "security_hotspots"));
		console.log(formatMetric("Code Smells", "code_smells"));
		console.log(formatMetric("Cognitive Complexity", "cognitive_complexity"));
		console.log(formatMetric("Technical Debt (min)", "sqale_index", " min"));
		console.log(
			formatMetric("Duplicated Lines", "duplicated_lines_density", "%"),
		);
		console.log("--------------------------------------------------\n");
	} catch (err) {
		console.error(
			c.red(
				`Error fetching metrics: ${err instanceof Error ? err.message : err}`,
			),
		);
		process.exit(1);
	}
}

export async function getCoverageCommand(options: {
	project: string;
	host: string;
	token?: string;
}) {
	console.log(
		c.cyan(`\n📉 Fetching new-code coverage gaps [${options.project}]...`),
	);

	try {
		const token = await resolveAuthToken(options);
		const gate = await fetchSonarApi<{
			projectStatus: {
				conditions?: Array<{
					metricKey: string;
					status: string;
					errorThreshold?: string;
					actualValue?: string;
				}>;
			};
		}>(
			`/api/qualitygates/project_status?projectKey=${options.project}`,
			options.host,
			token,
		);

		const threshold = Number(
			gate.projectStatus.conditions?.find((cond) => cond.metricKey === "new_coverage")
				?.errorThreshold ?? "80",
		);

		const data = await fetchSonarApi<{
			components: Array<{
				path: string;
				qualifier: string;
				measures: Array<{
					metric: string;
					period?: { value: string };
					value?: string;
				}>;
			}>;
		}>(
			`/api/measures/component_tree?component=${options.project}` +
				"&metricKeys=new_coverage,new_lines_to_cover,new_uncovered_lines,new_conditions_to_cover,new_uncovered_conditions&ps=500",
			options.host,
			token,
		);

		const rows: Array<{
			path: string;
			toCover: number;
			missLines: number;
			missCond: number;
		}> = [];

		let totalLines = 0;
		let missLines = 0;
		let totalCond = 0;
		let missCond = 0;

		for (const component of data.components) {
			if (component.qualifier !== "FIL") continue;

			const measure = (metric: string) => {
				const m = component.measures.find((entry) => entry.metric === metric);
				return Number(m?.period?.value ?? m?.value ?? 0);
			};

			const toCover = measure("new_lines_to_cover");
			if (toCover === 0) continue;

			const fileMissLines = measure("new_uncovered_lines");
			const fileMissCond = measure("new_uncovered_conditions");

			rows.push({
				path: component.path,
				toCover,
				missLines: fileMissLines,
				missCond: fileMissCond,
			});

			totalLines += toCover;
			missLines += fileMissLines;
			totalCond += measure("new_conditions_to_cover");
			missCond += fileMissCond;
		}

		rows.sort((a, b) => b.missLines + b.missCond - (a.missLines + a.missCond));

		if (rows.length === 0) {
			console.log(
				c.green("✨ No new-code coverage data found. Run analysis first.\n"),
			);
			return;
		}

		console.log(
			c.bold(
				`${"File".padEnd(46)} ${"missLines".padStart(9)} ${"missCond".padStart(8)} ${"total".padStart(7)}`,
			),
		);
		for (const row of rows) {
			if (row.missLines + row.missCond === 0) continue;
			console.log(
				`${c.red(row.path.padEnd(46))} ${String(row.missLines).padStart(9)} ${String(row.missCond).padStart(8)} ${String(row.toCover).padStart(7)}`,
			);
		}

		const total = totalLines + totalCond;
		const miss = missLines + missCond;
		const coveragePct = total === 0 ? 0 : (100 * (total - miss)) / total;
		const missAllowed = Math.floor((total * (100 - threshold)) / 100);
		const needToCover = Math.max(0, miss - missAllowed);

		console.log("─".repeat(74));
		console.log(
			c.bold(
				`TOTAL: ${total} new-code items (lines ${totalLines}, conditions ${totalCond}), ${miss} uncovered`,
			),
		);
		console.log(
			c.bold(
				`new_coverage: ${coveragePct.toFixed(1)}% (blends lines + conditions) | gate: ${threshold}%`,
			),
		);

		if (needToCover > 0) {
			console.log(c.yellow(`➜ Cover ${needToCover} more items to pass gate\n`));
		} else {
			console.log(
				c.green(`✅ Above gate threshold by ${missAllowed - miss} items\n`),
			);
		}
	} catch (err) {
		console.error(
			c.red(
				`Error fetching coverage: ${err instanceof Error ? err.message : err}`,
			),
		);
		process.exit(1);
	}
}

export async function runScanCommand(options: {
	host: string;
	token?: string;
}) {
	// host passed through options to resolveAuthToken
	try {
		const token = await resolveAuthToken(options);
		await syncTokenToProperties(token);

		const scannerBinary =
			process.platform === "win32" ? "sonar-scanner.cmd" : "sonar-scanner";
		const child = spawn(scannerBinary, [], {
			env: {
				...process.env,
				SONAR_TOKEN: token,
			},
			stdio: "inherit",
		});

		child.on("error", (err) => {
			console.error(c.red(`Failed to start sonar-scanner: ${err.message}`));
			console.error(
				c.dim(
					"Ensure sonar-scanner is installed (e.g. `brew install sonar-scanner` or install sonarqube-scanner).",
				),
			);
			process.exit(1);
		});

		child.on("close", (code) => {
			process.exit(code ?? 0);
		});
	} catch (err) {
		console.error(
			c.red(`Error running scan: ${err instanceof Error ? err.message : err}`),
		);
		process.exit(1);
	}
}

// Lightweight argument parsing without external libraries
function parseArgs(argv: string[]) {
	const args = argv.slice(2);
	const command = args[0] && !args[0].startsWith("-") ? args[0] : undefined;
	const startIndex = command ? 1 : 0;

	let host = DEFAULT_HOST;
	let project = DEFAULT_PROJECT_KEY;
	let token: string | undefined;
	let resolved = false;
	let type: string | undefined;
	let severity: string | undefined;

	for (let i = startIndex; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-h" || arg === "--host") {
			host = args[++i] ?? host;
		} else if (arg === "-p" || arg === "--project") {
			project = args[++i] ?? project;
		} else if (arg === "-t" || arg === "--token") {
			token = args[++i];
		} else if (arg === "--resolved") {
			resolved = true;
		} else if (arg === "--type") {
			type = args[++i];
		} else if (arg === "--severity") {
			severity = args[++i];
		} else if (arg === "--help") {
			showHelp();
			process.exit(0);
		}
	}

	return { command, host, project, token, resolved, type, severity };
}

function showHelp() {
	console.log(`
${c.bold("SonarQube CLI query utility for byos_next")}

Usage:
  node --import tsx/esm scripts/sonar-cli.ts [command] [options]
  bun run scripts/sonar-cli.ts [command] [options]

Commands:
  issues           List SonarQube issues (default command)
  status, gate     Check Quality Gate status
  metrics, measures Fetch project metrics & complexity overview
  coverage, gaps   Show per-file new-code coverage gaps and gate deficit
  token            Generate new auth token & update sonar-project.properties
  scan             Run SonarQube scanner with authenticated token

Options:
  -h, --host <url>         SonarQube server host URL (default: ${DEFAULT_HOST})
  -p, --project <key>      SonarQube project key (default: ${DEFAULT_PROJECT_KEY})
  -t, --token <token>      SonarQube user token (defaults to auto-resolve)
      --resolved           Show resolved issues instead of open (issues only)
      --type <type>        Filter by issue type: BUG, CODE_SMELL, VULNERABILITY
      --severity <sev>     Filter by severity: INFO, MINOR, MAJOR, CRITICAL, BLOCKER
      --help               Display this help text
`);
}

async function main() {
	const parsed = parseArgs(process.argv);
	const cmd = parsed.command ?? "issues";

	switch (cmd) {
		case "issues":
			await getIssuesCommand(parsed);
			break;
		case "status":
		case "gate":
			await getQualityGateCommand(parsed);
			break;
		case "metrics":
		case "measures":
			await getMetricsCommand(parsed);
			break;
		case "coverage":
		case "gaps":
			await getCoverageCommand(parsed);
			break;
		case "token": {
			console.log(
				c.cyan(
					`\n🔑 Requesting new SonarQube auth token from ${parsed.host}...`,
				),
			);
			try {
				const token = await generateNewToken(parsed.host);
				const synced = await syncTokenToProperties(token);
				console.log(c.green(`\n✅ Generated token: ${c.bold(token)}`));
				if (synced) {
					console.log(
						c.dim("Updated sonar-project.properties with new token.\n"),
					);
				}
			} catch (err) {
				console.error(
					c.red(
						`Error generating token: ${err instanceof Error ? err.message : err}`,
					),
				);
				process.exit(1);
			}
			break;
		}
		case "scan":
			await runScanCommand(parsed);
			break;
		default:
			console.error(c.red(`Unknown command: ${cmd}`));
			showHelp();
			process.exit(1);
	}
}

if (process.argv[1]?.endsWith("sonar-cli.ts")) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
