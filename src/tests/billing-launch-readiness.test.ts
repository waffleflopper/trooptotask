import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readinessScriptUrl = new URL('../../scripts/billing-launch-readiness.mjs', import.meta.url);
const readinessScriptPath = fileURLToPath(readinessScriptUrl);
const repoRootPath = fileURLToPath(new URL('../..', import.meta.url));

type ReadinessStatus = 'go' | 'blocked' | 'needs_confirmation';

interface ReadinessCheck {
	id: string;
	status: ReadinessStatus;
	reason: string;
}

interface ReadinessReason {
	id: string;
	reason: string;
}

interface ReadinessResult {
	status: ReadinessStatus;
	checks: ReadinessCheck[];
	reasons: ReadinessReason[];
}

interface PreflightResult {
	command: string;
	exitCode: number;
	summary: { pass: number; warn: number; fail: number } | null;
	results: unknown[];
	error?: string;
}

interface ReadinessModule {
	REQUIRED_CONFIRMATION_ARTIFACTS: string[];
	REQUIRED_SCENARIOS: string[];
	parseConfirmationArtifacts: (markdown: string | null) => Set<string>;
	parseScenarioEvidence: (markdown: string | null) => Map<string, string>;
	preflightResultFromCompleted: (
		completed: { status?: number | null; stdout?: string | null; stderr?: string | null } | null,
		options: { offline: boolean }
	) => PreflightResult;
	buildReadinessResult: (input: {
		offline: boolean;
		generatedAt: string;
		preflight?: PreflightResult;
		files: Record<string, string>;
		scenarios: Map<string, string>;
		confirmationArtifacts: Set<string>;
		confirmationsPath: string;
	}) => ReadinessResult;
}

const files = {
	'docs/billing-operations-launch-checklist.md':
		'support@trooptotask.org privacy@trooptotask.org security@trooptotask.org',
	'docs/launch-acquisition-path.md':
		'Support owner: Robert support@trooptotask.org privacy@trooptotask.org security@trooptotask.org',
	'src/lib/server/core/useCases/readOnlyMode.ts': 'readOnlyModeStateForPlanPolicy',
	'src/lib/server/core/useCases/routeAuthorization.ts':
		"'billing-recovery' organization.manageBilling enforceReadOnlyOverlay: !allowsReadOnlyModeException(config)"
};

function resultFor(input: {
	preflight?: PreflightResult;
	files?: Record<string, string>;
	scenarios?: Map<string, string>;
	confirmationArtifacts?: Set<string>;
}) {
	return loadReadinessModule().then(async ({ buildReadinessResult }) =>
		buildReadinessResult({
			offline: true,
			generatedAt: '2026-06-24T00:00:00.000Z',
			preflight: input.preflight ?? passingPreflight(),
			files: input.files ?? files,
			scenarios: input.scenarios ?? (await passingScenarios()),
			confirmationArtifacts: input.confirmationArtifacts ?? (await passingConfirmations()),
			confirmationsPath: 'docs/billing-launch-confirmations.md'
		})
	);
}

async function loadReadinessModule(): Promise<ReadinessModule> {
	return import(readinessScriptUrl.href);
}

function passingPreflight() {
	return {
		command: 'npm run billing:launch-preflight -- --offline --json',
		exitCode: 0,
		summary: { pass: 10, warn: 0, fail: 0 },
		results: []
	};
}

function warningPreflight() {
	return {
		command: 'npm run billing:launch-preflight -- --offline --json',
		exitCode: 0,
		summary: { pass: 10, warn: 1, fail: 0 },
		results: []
	};
}

async function passingScenarios() {
	const { REQUIRED_SCENARIOS } = await loadReadinessModule();
	return new Map(REQUIRED_SCENARIOS.map((scenario) => [scenario, 'Go']));
}

async function passingConfirmations() {
	const { REQUIRED_CONFIRMATION_ARTIFACTS } = await loadReadinessModule();
	return new Set(REQUIRED_CONFIRMATION_ARTIFACTS);
}

describe('billing launch readiness classification', () => {
	it('CLI exits 0 for a support-safe report and requires JSON status inspection', () => {
		const completed = spawnSync(process.execPath, [readinessScriptPath, '--offline', '--json'], {
			cwd: repoRootPath,
			encoding: 'utf8',
			env: {
				...process.env,
				PUBLIC_BILLING_ENABLED: 'true',
				STRIPE_SECRET_KEY: 'sk_test_placeholder',
				STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
				STRIPE_TEAM_PRICE_ID: 'price_team_placeholder',
				STRIPE_UNIT_PRICE_ID: 'price_unit_placeholder',
				BILLING_RECONCILIATION_SECRET: 'reconciliation_placeholder'
			}
		});

		expect(completed.status).toBe(0);
		const report = JSON.parse(completed.stdout) as ReadinessResult;
		expect(['go', 'blocked', 'needs_confirmation']).toContain(report.status);
		expect(Array.isArray(report.checks)).toBe(true);
		expect(Array.isArray(report.reasons)).toBe(true);
		expect(report.checks.every((check) => check.id && check.status && check.reason)).toBe(true);
		expect(report.reasons.every((reason) => reason.id && reason.reason)).toBe(true);
	});

	it('parses scenario evidence rows while ignoring markdown table headers', async () => {
		const { parseScenarioEvidence } = await loadReadinessModule();
		const scenarios = parseScenarioEvidence(`
| Scenario | Status | Evidence captured |
| --- | --- | --- |
| Checkout activation | Go | Safe ID only. |
| Renewal success | Needs confirmation | Robert artifact pending. |
`);

		expect(scenarios.get('Checkout activation')).toBe('Go');
		expect(scenarios.get('Renewal success')).toBe('Needs confirmation');
		expect(scenarios.has('Scenario')).toBe(false);
	});

	it('parses only Robert-owned dated confirmation artifacts', async () => {
		const { parseConfirmationArtifacts } = await loadReadinessModule();
		const artifacts = parseConfirmationArtifacts(`
| Date | Owner | Artifact name |
| --- | --- | --- |
| 2026-06-24 | Robert | live-stripe-dashboard-confirmation |
| 2026-06-24 | Agent | ignored-agent-artifact |
| pending | Robert | ignored-undated-artifact |
`);

		expect(artifacts).toEqual(new Set(['live-stripe-dashboard-confirmation']));
	});

	it('blocks when preflight data is missing', async () => {
		const { buildReadinessResult } = await loadReadinessModule();
		const result = buildReadinessResult({
			offline: true,
			generatedAt: '2026-06-24T00:00:00.000Z',
			files,
			scenarios: await passingScenarios(),
			confirmationArtifacts: await passingConfirmations(),
			confirmationsPath: 'docs/billing-launch-confirmations.md'
		});

		expect(result.status).toBe('blocked');
		expect(result.checks).toContainEqual(expect.objectContaining({ id: 'machine.preflight', status: 'blocked' }));
	});

	it('blocks when preflight reports failures or a nonzero exit code', async () => {
		const failedPreflight = {
			command: 'npm run billing:launch-preflight -- --offline --json',
			exitCode: 1,
			summary: { pass: 9, warn: 0, fail: 1 },
			results: []
		};
		const nonzeroPreflight = {
			command: 'npm run billing:launch-preflight -- --offline --json',
			exitCode: 1,
			summary: { pass: 10, warn: 0, fail: 0 },
			results: []
		};

		await expect(resultFor({ preflight: failedPreflight })).resolves.toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([expect.objectContaining({ id: 'machine.preflight', status: 'blocked' })])
		});
		await expect(resultFor({ preflight: nonzeroPreflight })).resolves.toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([expect.objectContaining({ id: 'machine.preflight', status: 'blocked' })])
		});
	});

	it('keeps malformed preflight output support-safe and does not leak raw stderr', async () => {
		const { preflightResultFromCompleted } = await loadReadinessModule();
		const preflight = preflightResultFromCompleted(
			{ status: 1, stdout: 'not json', stderr: 'Stripe failure sk_live_LEAK' },
			{ offline: true }
		);
		const result = await resultFor({ preflight });

		expect(preflight.error).toBe('Preflight did not emit parseable JSON. Re-run it directly to inspect raw output.');
		expect(JSON.stringify(result)).not.toContain('sk_live_LEAK');
		expect(result).toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([expect.objectContaining({ id: 'machine.preflight', status: 'blocked' })])
		});
	});

	it('treats malformed preflight JSON shapes as support-safe parse failures', async () => {
		const { preflightResultFromCompleted } = await loadReadinessModule();
		const malformedOutputs = [
			{ stdout: JSON.stringify(null), label: 'null output' },
			{ stdout: JSON.stringify([]), label: 'array output' },
			{ stdout: JSON.stringify({ summary: null, results: [] }), label: 'missing summary object' },
			{
				stdout: JSON.stringify({ summary: { pass: 1, warn: 0, fail: 0 }, results: null }),
				label: 'missing results array'
			}
		];

		for (const item of malformedOutputs) {
			const preflight = preflightResultFromCompleted({ status: 0, stdout: item.stdout, stderr: '' }, { offline: true });

			expect(preflight, item.label).toMatchObject({
				exitCode: 0,
				summary: null,
				results: [],
				error: 'Preflight did not emit parseable JSON. Re-run it directly to inspect raw output.'
			});
		}
	});

	it('blocks safely when preflight execution returns no output', async () => {
		const { preflightResultFromCompleted } = await loadReadinessModule();
		const preflight = preflightResultFromCompleted({ status: null, stdout: null, stderr: null }, { offline: true });
		const result = await resultFor({ preflight });

		expect(preflight.error).toBe('Preflight could not be executed. Re-run it directly to inspect local setup.');
		expect(result).toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([expect.objectContaining({ id: 'machine.preflight', status: 'blocked' })])
		});
	});

	it('marks preflight warnings as confirmation needs', async () => {
		const { buildReadinessResult } = await loadReadinessModule();
		const result = buildReadinessResult({
			offline: true,
			generatedAt: '2026-06-24T00:00:00.000Z',
			preflight: warningPreflight(),
			files,
			scenarios: await passingScenarios(),
			confirmationArtifacts: await passingConfirmations(),
			confirmationsPath: 'docs/billing-launch-confirmations.md'
		});

		expect(result.status).toBe('needs_confirmation');
		expect(result.checks).toContainEqual(
			expect.objectContaining({ id: 'machine.preflight', status: 'needs_confirmation' })
		);
	});

	it('blocks when read-only gate evidence is missing', async () => {
		const result = await resultFor({ files: { ...files, 'src/lib/server/core/useCases/readOnlyMode.ts': '' } });

		expect(result).toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([
				expect.objectContaining({ id: 'machine.billing_read_only_gate', status: 'blocked' })
			])
		});
	});

	it('blocks when already-confirmed support channel evidence is missing', async () => {
		const result = await resultFor({
			files: { ...files, 'docs/billing-operations-launch-checklist.md': 'support@trooptotask.org' }
		});

		expect(result).toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([expect.objectContaining({ id: 'confirmed.support_channels', status: 'blocked' })])
		});
	});

	it('blocks when a required scenario row is still blocked', async () => {
		const scenarios = await passingScenarios();
		scenarios.set('Checkout activation', 'Blocked');
		const result = await resultFor({ scenarios });

		expect(result).toMatchObject({
			status: 'blocked',
			checks: expect.arrayContaining([
				expect.objectContaining({
					id: 'evidence.lifecycle_scenarios',
					status: 'blocked',
					reason: expect.stringContaining('Checkout activation')
				})
			])
		});
	});

	it('returns needs_confirmation when Robert confirmations are absent and other checks pass', async () => {
		const { buildReadinessResult } = await loadReadinessModule();
		const result = buildReadinessResult({
			offline: true,
			generatedAt: '2026-06-24T00:00:00.000Z',
			preflight: passingPreflight(),
			files,
			scenarios: await passingScenarios(),
			confirmationArtifacts: new Set(),
			confirmationsPath: 'docs/billing-launch-confirmations.md'
		});

		expect(result.status).toBe('needs_confirmation');
		expect(result.checks).toContainEqual(
			expect.objectContaining({ id: 'confirmation.robert_owned_launch', status: 'needs_confirmation' })
		);
	});

	it('returns go only when all checks and sanitized confirmations are represented', async () => {
		const { buildReadinessResult } = await loadReadinessModule();
		const result = buildReadinessResult({
			offline: true,
			generatedAt: '2026-06-24T00:00:00.000Z',
			preflight: passingPreflight(),
			files,
			scenarios: await passingScenarios(),
			confirmationArtifacts: await passingConfirmations(),
			confirmationsPath: 'docs/billing-launch-confirmations.md'
		});

		expect(result.status).toBe('go');
		expect(result.checks.every((check) => check.status === 'go')).toBe(true);
	});
});
