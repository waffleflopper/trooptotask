#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/*
Result contract:
- status is exactly "go", "blocked", or "needs_confirmation".
- result.reasons contains support-safe launch blockers or confirmation needs.
- result.checks contains id, label, status, owner, evidenceSource, and reason.
- evidenceSource is a command name, source file path, or support-safe artifact
  name; it must not contain secrets, screenshots, raw Stripe payloads, or
  production probing evidence.
*/

const REQUIRED_SCENARIOS = [
	'Checkout activation',
	'Renewal success',
	'Failed renewal',
	'Portal period-end cancellation',
	'Immediate cancellation',
	'End-of-period terminal cancellation',
	'Payment recovery and reactivation',
	'Plan change',
	'Unsupported event'
];

const REQUIRED_CONFIRMATION_ARTIFACTS = [
	'test-stripe-dashboard-confirmation',
	'live-stripe-dashboard-confirmation',
	'final-live-price-ids-confirmation',
	'live-deployment-variables-confirmation',
	'stripe-tax-launch-decision',
	'support-staffing-confirmation',
	'final-paid-billing-launch-approval'
];

const DEFAULT_CONFIRMATIONS_PATH = 'docs/billing-launch-confirmations.md';
const GO_NO_GO_PATH = 'docs/billing-launch-go-no-go.md';
const OPERATIONS_CHECKLIST_PATH = 'docs/billing-operations-launch-checklist.md';
const ACQUISITION_PATH = 'docs/launch-acquisition-path.md';
const READ_ONLY_MODE_PATH = 'src/lib/server/core/useCases/readOnlyMode.ts';
const ROUTE_AUTHORIZATION_PATH = 'src/lib/server/core/useCases/routeAuthorization.ts';

function parseArgs(argv) {
	const args = {
		json: argv.includes('--json'),
		offline: argv.includes('--offline'),
		confirmationsPath: DEFAULT_CONFIRMATIONS_PATH
	};

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === '--confirmations') {
			const next = argv[index + 1];
			if (!next || next.startsWith('--')) throw new Error('Missing --confirmations path');
			args.confirmationsPath = next;
			index += 1;
		}
	}

	return args;
}

function safeRead(path) {
	if (!existsSync(path)) return null;
	return readFileSync(path, 'utf8');
}

function runPreflight({ offline }) {
	const commandArgs = ['./scripts/billing-launch-preflight.mjs', '--json'];
	if (offline) commandArgs.push('--offline');

	const completed = spawnSync(process.execPath, commandArgs, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});

	try {
		const parsed = JSON.parse(completed.stdout);
		return {
			command: `npm run billing:launch-preflight -- ${offline ? '--offline ' : ''}--json`,
			exitCode: completed.status ?? 1,
			summary: parsed.summary,
			results: parsed.results
		};
	} catch {
		return {
			command: `npm run billing:launch-preflight -- ${offline ? '--offline ' : ''}--json`,
			exitCode: completed.status ?? 1,
			summary: null,
			results: [],
			error: completed.stderr.trim() || 'Preflight did not emit parseable JSON.'
		};
	}
}

function parseScenarioEvidence(markdown) {
	if (!markdown) return new Map();
	const rows = new Map();
	for (const line of markdown.split(/\r?\n/)) {
		if (!line.startsWith('|')) continue;
		const cells = line
			.split('|')
			.slice(1, -1)
			.map((cell) => cell.trim());
		if (cells.length < 2 || cells[0] === 'Scenario' || cells[0].startsWith('---')) continue;
		rows.set(cells[0], cells[1]);
	}
	return rows;
}

function parseConfirmationArtifacts(markdown) {
	if (!markdown) return new Set();
	const artifacts = new Set();
	for (const line of markdown.split(/\r?\n/)) {
		if (!line.startsWith('|')) continue;
		const cells = line
			.split('|')
			.slice(1, -1)
			.map((cell) => cell.trim());
		if (cells.length < 3 || cells[0] === 'Date' || cells[0].startsWith('---')) continue;
		const [date, owner, artifactName] = cells;
		if (/^\d{4}-\d{2}-\d{2}$/.test(date) && owner === 'Robert' && artifactName) {
			artifacts.add(artifactName);
		}
	}
	return artifacts;
}

function normalizeEvidenceStatus(value) {
	const normalized = value.toLowerCase().replace(/\s+/g, '_');
	if (['go', 'passed', 'pass', 'complete', 'completed'].includes(normalized)) return 'go';
	if (['needs_confirmation', 'requires_robert_confirmation', 'requires_confirmation'].includes(normalized)) {
		return 'needs_confirmation';
	}
	return 'blocked';
}

function evaluatePreflight(preflight) {
	if (!preflight?.summary) {
		return {
			id: 'machine.preflight',
			label: 'Billing launch preflight',
			status: 'blocked',
			owner: 'Agent',
			evidenceSource: preflight?.command ?? 'npm run billing:launch-preflight -- --json',
			reason: preflight?.error ?? 'Preflight data is missing.'
		};
	}

	const failCount = preflight.summary.fail ?? 0;
	const warnCount = preflight.summary.warn ?? 0;
	if (failCount > 0 || preflight.exitCode !== 0) {
		return {
			id: 'machine.preflight',
			label: 'Billing launch preflight',
			status: 'blocked',
			owner: 'Agent',
			evidenceSource: preflight.command,
			reason: `${failCount} preflight failure(s) must be resolved before launch.`
		};
	}
	if (warnCount > 0) {
		return {
			id: 'machine.preflight',
			label: 'Billing launch preflight',
			status: 'needs_confirmation',
			owner: 'Robert',
			evidenceSource: preflight.command,
			reason: `${warnCount} preflight warning(s) require support-safe confirmation before launch.`
		};
	}

	return {
		id: 'machine.preflight',
		label: 'Billing launch preflight',
		status: 'go',
		owner: 'Agent',
		evidenceSource: preflight.command,
		reason: 'Preflight completed with no failures or warnings.'
	};
}

function evaluateReadOnlyGate(files) {
	const readOnlyMode = files[READ_ONLY_MODE_PATH] ?? '';
	const routeAuthorization = files[ROUTE_AUTHORIZATION_PATH] ?? '';
	const hasReadOnlyPolicyMapper = readOnlyMode.includes('readOnlyModeStateForPlanPolicy');
	const hasBillingRecoveryException =
		routeAuthorization.includes("'billing-recovery'") &&
		routeAuthorization.includes('organization.manageBilling') &&
		routeAuthorization.includes('enforceReadOnlyOverlay: !allowsReadOnlyModeException(config)');

	if (hasReadOnlyPolicyMapper && hasBillingRecoveryException) {
		return {
			id: 'machine.billing_read_only_gate',
			label: 'Billing read-only gate and recovery exception',
			status: 'go',
			owner: 'Agent',
			evidenceSource: `${READ_ONLY_MODE_PATH}; ${ROUTE_AUTHORIZATION_PATH}`,
			reason: 'Billing policy failures map into read-only mode while billing recovery remains available.'
		};
	}

	return {
		id: 'machine.billing_read_only_gate',
		label: 'Billing read-only gate and recovery exception',
		status: 'blocked',
		owner: 'Agent',
		evidenceSource: `${READ_ONLY_MODE_PATH}; ${ROUTE_AUTHORIZATION_PATH}`,
		reason: 'Read-only billing policy evidence or billing recovery exception evidence is missing.'
	};
}

function evaluateSupportChannels(files) {
	const operationsChecklist = files[OPERATIONS_CHECKLIST_PATH] ?? '';
	const acquisitionPath = files[ACQUISITION_PATH] ?? '';
	const required = ['support@trooptotask.org', 'privacy@trooptotask.org', 'security@trooptotask.org'];
	const channelsConfirmed =
		required.every((mailbox) => operationsChecklist.includes(mailbox) && acquisitionPath.includes(mailbox)) &&
		acquisitionPath.includes('Support owner: Robert');

	if (channelsConfirmed) {
		return {
			id: 'confirmed.support_channels',
			label: 'Already-confirmed support channels',
			status: 'go',
			owner: 'Robert',
			evidenceSource: `${OPERATIONS_CHECKLIST_PATH}; ${ACQUISITION_PATH}`,
			reason: 'Canonical support, privacy, and security mailboxes are already recorded.'
		};
	}

	return {
		id: 'confirmed.support_channels',
		label: 'Already-confirmed support channels',
		status: 'blocked',
		owner: 'Robert',
		evidenceSource: `${OPERATIONS_CHECKLIST_PATH}; ${ACQUISITION_PATH}`,
		reason: 'Canonical support channel confirmation evidence is missing.'
	};
}

function evaluateScenarios(scenarios) {
	const missing = [];
	const blocked = [];
	const needsConfirmation = [];

	for (const scenario of REQUIRED_SCENARIOS) {
		const status = scenarios.get(scenario);
		if (!status) {
			missing.push(scenario);
			continue;
		}

		const normalized = normalizeEvidenceStatus(status);
		if (normalized === 'blocked') blocked.push(scenario);
		if (normalized === 'needs_confirmation') needsConfirmation.push(scenario);
	}

	if (missing.length > 0 || blocked.length > 0) {
		return {
			id: 'evidence.lifecycle_scenarios',
			label: 'Billing lifecycle scenario evidence',
			status: 'blocked',
			owner: 'Robert/Agent with test credentials',
			evidenceSource: GO_NO_GO_PATH,
			reason: [
				missing.length ? `Missing scenario row(s): ${missing.join(', ')}.` : null,
				blocked.length ? `Blocked scenario row(s): ${blocked.join(', ')}.` : null
			]
				.filter(Boolean)
				.join(' ')
		};
	}

	if (needsConfirmation.length > 0) {
		return {
			id: 'evidence.lifecycle_scenarios',
			label: 'Billing lifecycle scenario evidence',
			status: 'needs_confirmation',
			owner: 'Robert',
			evidenceSource: GO_NO_GO_PATH,
			reason: `Scenario row(s) require Robert confirmation: ${needsConfirmation.join(', ')}.`
		};
	}

	return {
		id: 'evidence.lifecycle_scenarios',
		label: 'Billing lifecycle scenario evidence',
		status: 'go',
		owner: 'Robert/Agent with test credentials',
		evidenceSource: GO_NO_GO_PATH,
		reason: 'Required billing lifecycle scenarios are represented as passed or complete.'
	};
}

function evaluateConfirmations(artifacts, confirmationsPath) {
	const missing = REQUIRED_CONFIRMATION_ARTIFACTS.filter((artifact) => !artifacts.has(artifact));
	if (missing.length > 0) {
		return {
			id: 'confirmation.robert_owned_launch',
			label: 'Robert-owned launch confirmations',
			status: 'needs_confirmation',
			owner: 'Robert',
			evidenceSource: confirmationsPath,
			reason: `Missing support-safe confirmation artifact(s): ${missing.join(', ')}.`
		};
	}

	return {
		id: 'confirmation.robert_owned_launch',
		label: 'Robert-owned launch confirmations',
		status: 'go',
		owner: 'Robert',
		evidenceSource: confirmationsPath,
		reason: 'All required Robert-owned confirmation artifacts are recorded.'
	};
}

function overallStatus(checks) {
	if (checks.some((check) => check.status === 'blocked')) return 'blocked';
	if (checks.some((check) => check.status === 'needs_confirmation')) return 'needs_confirmation';
	return 'go';
}

function buildReadinessResult(input) {
	const checks = [
		evaluatePreflight(input.preflight),
		evaluateReadOnlyGate(input.files),
		evaluateSupportChannels(input.files),
		evaluateScenarios(input.scenarios),
		evaluateConfirmations(input.confirmationArtifacts, input.confirmationsPath)
	];
	const status = overallStatus(checks);
	const summary = {
		go: checks.filter((check) => check.status === 'go').length,
		blocked: checks.filter((check) => check.status === 'blocked').length,
		needs_confirmation: checks.filter((check) => check.status === 'needs_confirmation').length
	};

	return {
		status,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		mode: input.offline ? 'offline' : 'online-test-mode-preflight',
		summary,
		reasons: checks
			.filter((check) => check.status !== 'go')
			.map((check) => ({
				id: check.id,
				status: check.status,
				owner: check.owner,
				evidenceSource: check.evidenceSource,
				reason: check.reason
			})),
		checks
	};
}

function printResult(result, json) {
	if (json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(`Billing launch readiness: ${result.status}`);
	for (const check of result.checks) {
		console.log(`${check.status.toUpperCase()} ${check.label} (${check.owner}): ${check.reason}`);
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const files = {
		[GO_NO_GO_PATH]: safeRead(GO_NO_GO_PATH),
		[OPERATIONS_CHECKLIST_PATH]: safeRead(OPERATIONS_CHECKLIST_PATH),
		[ACQUISITION_PATH]: safeRead(ACQUISITION_PATH),
		[READ_ONLY_MODE_PATH]: safeRead(READ_ONLY_MODE_PATH),
		[ROUTE_AUTHORIZATION_PATH]: safeRead(ROUTE_AUTHORIZATION_PATH)
	};
	const confirmationMarkdown = safeRead(args.confirmationsPath);
	const result = buildReadinessResult({
		offline: args.offline,
		preflight: runPreflight(args),
		files,
		scenarios: parseScenarioEvidence(files[GO_NO_GO_PATH]),
		confirmationArtifacts: parseConfirmationArtifacts(confirmationMarkdown),
		confirmationsPath: args.confirmationsPath
	});

	printResult(result, args.json);
}

export {
	REQUIRED_CONFIRMATION_ARTIFACTS,
	REQUIRED_SCENARIOS,
	buildReadinessResult,
	parseConfirmationArtifacts,
	parseScenarioEvidence
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	});
}
