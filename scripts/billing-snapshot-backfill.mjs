#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

/**
 * @typedef {Record<string, string | undefined>} EnvMap
 * @typedef {Record<string, string | boolean | undefined>} BackfillOptions
 * @typedef {{
 *   appUrl: string;
 *   secret: string;
 *   dryRun: boolean;
 *   limit: number | null;
 *   cursor: string | null;
 *   timeoutMs: number | null;
 *   json?: boolean;
 * }} BackfillPlan
 */

/**
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function parseEnvFile(path) {
	if (!existsSync(path)) return {};
	/** @type {Record<string, string>} */
	const env = {};
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
		if (!match || line.trimStart().startsWith('#')) continue;
		const [, key, rawValue] = match;
		env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
	}
	return env;
}

/**
 * @returns {EnvMap}
 */
export function loadEnv() {
	return {
		...parseEnvFile('.env'),
		...parseEnvFile('.env.local'),
		...process.env
	};
}

/**
 * @param {string[]} argv
 * @returns {BackfillOptions}
 */
export function parseArgs(argv) {
	/** @type {BackfillOptions} */
	const options = {
		execute: false,
		confirmProductionBackfill: false,
		json: false
	};

	for (let i = 0; i < argv.length; i += 1) {
		const value = argv[i];
		if (!value.startsWith('--')) continue;
		const key = value.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			options[key] = true;
			continue;
		}
		options[key] = next;
		i += 1;
	}

	return options;
}

/**
 * @param {BackfillOptions} options
 * @param {string} key
 */
function optionString(options, key) {
	const value = options[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param {BackfillOptions} options
 * @param {string} key
 */
function positiveIntegerOption(options, key) {
	const value = optionString(options, key);
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${key} must be a positive integer`);
	return Math.floor(parsed);
}

/**
 * @param {BackfillOptions} options
 * @param {EnvMap} env
 * @returns {BackfillPlan}
 */
export function resolveBackfillPlan(options, env) {
	const execute = options.execute === true;
	if (execute && options['confirm-production-backfill'] !== true && options.confirmProductionBackfill !== true) {
		throw new Error('Refusing to execute without --confirm-production-backfill.');
	}

	const appUrl =
		optionString(options, 'app-url') ?? env.BACKFILL_APP_URL ?? env.PUBLIC_APP_URL ?? 'http://localhost:5173';
	const secret =
		optionString(options, 'secret') ?? env.BILLING_RECONCILIATION_SECRET ?? env.CRON_SECRET ?? env.BACKFILL_SECRET;
	if (!secret) {
		throw new Error('BILLING_RECONCILIATION_SECRET, CRON_SECRET, BACKFILL_SECRET, or --secret is required.');
	}

	return {
		appUrl,
		secret,
		dryRun: !execute,
		limit: positiveIntegerOption(options, 'limit'),
		cursor: optionString(options, 'cursor'),
		timeoutMs: positiveIntegerOption(options, 'timeout-ms'),
		json: options.json === true
	};
}

/**
 * @param {BackfillPlan} plan
 */
export function buildBackfillUrl(plan) {
	const url = new URL('/api/billing-reconciliation', plan.appUrl.replace(/\/$/, ''));
	if (plan.dryRun) url.searchParams.set('dryRun', '1');
	if (plan.limit) url.searchParams.set('limit', String(plan.limit));
	if (plan.cursor) url.searchParams.set('cursor', plan.cursor);
	if (plan.timeoutMs) url.searchParams.set('timeoutMs', String(plan.timeoutMs));
	return url;
}

/**
 * @param {BackfillPlan} plan
 * @param {typeof fetch} [fetchImpl]
 */
export async function runBackfill(plan, fetchImpl = fetch) {
	const response = await fetchImpl(buildBackfillUrl(plan), {
		headers: {
			authorization: `Bearer ${plan.secret}`
		}
	});

	const body = await response.text();
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		payload = { raw: body };
	}

	if (!response.ok) {
		throw new Error(`Backfill request failed with HTTP ${response.status}: ${body}`);
	}

	return payload;
}

/**
 * @param {Record<string, unknown> & { dryRun?: boolean; processed?: number; succeeded?: number; failed?: number; drifted?: number; nextCursor?: string | null; results?: Array<Record<string, unknown> & { ok?: boolean; orgId?: string; status?: string; result?: string; plannedWrites?: string[] }> }} payload
 */
function printSummary(payload) {
	console.log(`Billing snapshot backfill ${payload.dryRun ? 'dry run' : 'execute'}`);
	console.log(
		`Processed ${payload.processed}, succeeded ${payload.succeeded}, failed ${payload.failed}, drifted ${payload.drifted}`
	);
	if (payload.nextCursor) console.log(`Next cursor: ${payload.nextCursor}`);
	for (const item of payload.results ?? []) {
		const marker = item.ok ? 'OK' : 'FAIL';
		const writes = item.plannedWrites?.length ? ` writes=${item.plannedWrites.join(',')}` : '';
		console.log(`${marker} ${item.orgId}: ${item.status} ${item.result}${writes}`);
	}
}

async function main() {
	const plan = resolveBackfillPlan(parseArgs(process.argv.slice(2)), loadEnv());
	const payload = await runBackfill(plan);
	if (plan.json) {
		console.log(JSON.stringify(payload, null, 2));
		return;
	}
	printSummary(payload);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	});
}
