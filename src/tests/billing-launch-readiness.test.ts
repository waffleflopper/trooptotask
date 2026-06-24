import { describe, expect, it } from 'vitest';

const readinessScriptUrl = new URL('../../scripts/billing-launch-readiness.mjs', import.meta.url);

type ReadinessStatus = 'go' | 'blocked' | 'needs_confirmation';

interface ReadinessCheck {
	id: string;
	status: ReadinessStatus;
}

interface ReadinessResult {
	status: ReadinessStatus;
	checks: ReadinessCheck[];
}

interface ReadinessModule {
	REQUIRED_CONFIRMATION_ARTIFACTS: string[];
	REQUIRED_SCENARIOS: string[];
	buildReadinessResult: (input: {
		offline: boolean;
		generatedAt: string;
		preflight?: {
			command: string;
			exitCode: number;
			summary: { pass: number; warn: number; fail: number } | null;
			results: unknown[];
		};
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
