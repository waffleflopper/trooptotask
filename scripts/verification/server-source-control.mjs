// Loaded only by the owned verification preview through Node's --import option.
// Application code and the provider are never modified to install these controls.
import { createServer } from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createMailSink, createProviderFaultController, providerOrigin } from './outbound-controls.mjs';

// Calendar and Personnel read the loss window alone; the Dashboard reads it with the strength floor in the policy read.
const LOSS_WINDOW_READS = [
	'loss_warning_window_days',
	'archive_retention_months,loss_warning_window_days,training_readiness_goal_percent,strength_floor_percent'
];
// Only the Policies loss sentence reads People this narrowly, so roster, record and archive reads pass through.
const NARROW_READS = {
	organizations: LOSS_WINDOW_READS,
	personnel: ['id,rank,last_name,ets,deros,group_id']
};

export const SERVER_SOURCE_TABLES = Object.freeze([
	'personnel_onboardings',
	'personnel_trainings',
	'availability_entries',
	'special_days',
	'daily_assignments',
	'assignment_types',
	'rating_scheme_entries',
	'personnel_ict_completions',
	'ict_tasks',
	'user_org_preferences',
	'getting_started_progress',
	'organizations',
	'personnel_follow_ups',
	'leader_notes',
	'counseling_records',
	'personnel_documents',
	'personnel_extended_info',
	'deletion_requests',
	'status_types',
	'audit_logs',
	'organization_invitations',
	'organization_rank_catalog',
	'personnel',
	'rpc/roster_signals'
]);
const ORGANIZATION_COLUMN = { organizations: 'id', audit_logs: 'org_id' };

function rpcOrganizations(method, body) {
	if (method !== 'POST' || typeof body !== 'string') return [];
	try {
		const organization = JSON.parse(body)?.p_organization_id;
		return typeof organization === 'string' ? [`eq.${organization}`] : [];
	} catch {
		return [];
	}
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createServerSourceController({ providerUrl, orgId, fetch: originalFetch }) {
	const origin = providerOrigin(providerUrl);
	if (!UUID.test(orgId) || typeof originalFetch !== 'function') throw new Error('Invalid owned source configuration.');
	let active = null;
	let last = null;

	function receipt(control = active) {
		if (!control) return null;
		return {
			table: control.table,
			orgId,
			mode: control.mode,
			ordinal: control.ordinal,
			holdMs: control.holdMs,
			phase: control.phase,
			matches: control.matches,
			call: control.call ? { ...control.call } : null
		};
	}

	function release(control, reason) {
		if (!control) return;
		clearTimeout(control.timer);
		control.released = true;
		control.phase = reason;
		control.resume?.();
	}

	function command(action, options = {}) {
		if (action === 'arm') {
			if (active) throw new Error('Restore the active server source control before arming another.');
			const { table, mode, ordinal = 1, holdMs = 30000 } = options;
			if (
				!SERVER_SOURCE_TABLES.includes(table) ||
				!['hold', 'fail', 'fail-hard'].includes(mode) ||
				!Number.isInteger(ordinal) ||
				ordinal < 1 ||
				ordinal > 10 ||
				!Number.isInteger(holdMs) ||
				holdMs < 100 ||
				holdMs > 120000
			)
				throw new Error('Use an allowlisted source, hold|fail|fail-hard, ordinal 1–10 and deadline 100–120000ms.');
			const control = {
				table,
				mode,
				ordinal,
				holdMs,
				matches: 0,
				phase: 'armed',
				released: false,
				triggered: false,
				call: null,
				resume: null
			};
			active = control;
			control.timer = setTimeout(() => release(control, 'deadline'), holdMs);
		} else if (action === 'release') {
			release(active, 'released');
		} else if (action === 'restore') {
			release(active, 'restored');
			last = receipt() ?? last;
			active = null;
		} else if (action !== 'state') {
			throw new Error('Use server source arm, state, release or restore.');
		}
		return { status: 'PASS', armed: active !== null, control: receipt(), lastControl: last };
	}

	async function controlledFetch(input, init) {
		const control = active;
		if (!control || control.released || control.triggered) return originalFetch(input, init);
		let url;
		try {
			url = new URL(input instanceof Request ? input.url : String(input));
		} catch {
			return originalFetch(input, init);
		}
		const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
		const rpc = control.table.startsWith('rpc/');
		const organizations = rpc
			? rpcOrganizations(method, init?.body)
			: url.searchParams.getAll(ORGANIZATION_COLUMN[control.table] ?? 'organization_id');
		const selection = url.searchParams.getAll('select');
		const narrow = NARROW_READS[control.table];
		const matchesSelection = !narrow || (selection.length === 1 && narrow.includes(selection[0]));
		// Counts are HEAD reads; the narrow reads stay GET only.
		// The roster signal reads are POSTed RPCs that name their Organization in the body.
		const readMethod = rpc || method === 'GET' || (method === 'HEAD' && !narrow);
		if (
			!readMethod ||
			url.origin !== origin ||
			url.username ||
			url.password ||
			url.pathname !== `/rest/v1/${control.table}` ||
			!matchesSelection ||
			organizations.length !== 1 ||
			organizations[0] !== `eq.${orgId}`
		)
			return originalFetch(input, init);
		control.matches++;
		if (control.matches !== control.ordinal) return originalFetch(input, init);
		control.triggered = true;
		control.call = { method, table: control.table, orgId, status: null, synthetic: control.mode !== 'hold' };
		if (control.mode !== 'hold') {
			clearTimeout(control.timer);
			control.phase = 'synthetic-failure';
			const status = control.mode === 'fail-hard' ? 500 : 503;
			control.call.status = status;
			return new Response(
				JSON.stringify({ code: 'T2T_VERIFY_SOURCE_FAILURE', message: 'Synthetic verification source failure' }),
				{ status, headers: { 'Content-Type': 'application/json' } }
			);
		}
		control.phase = 'dispatching';
		let response;
		try {
			response = await originalFetch(input, init);
		} catch (error) {
			clearTimeout(control.timer);
			control.phase = 'provider-rejection';
			throw error;
		}
		control.call.status = response.status;
		if (active !== control || control.released) return response;
		const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
		if (signal?.aborted) {
			release(control, 'interrupted');
			throw new DOMException('The held source request was aborted', 'AbortError');
		}
		control.phase = 'held';
		await new Promise((resolve, reject) => {
			const abort = () => {
				control.resume = null;
				signal.removeEventListener('abort', abort);
				release(control, 'interrupted');
				reject(new DOMException('The held source request was aborted', 'AbortError'));
			};
			control.resume = () => {
				signal?.removeEventListener('abort', abort);
				control.resume = null;
				resolve();
			};
			signal?.addEventListener('abort', abort, { once: true });
		});
		return response;
	}

	return { fetch: controlledFetch, command };
}

export async function startServerSourceControl(config) {
	if (!UUID.test(config.sessionId) || !/^[0-9a-f]{64}$/.test(config.token))
		throw new Error('Invalid source control identity.');
	const source = createServerSourceController({ ...config, fetch: globalThis.fetch });
	const faults = createProviderFaultController({ providerUrl: config.providerUrl, fetch: source.fetch });
	const mail = config.mailApiKey ? createMailSink({ apiKey: config.mailApiKey, fetch: faults.fetch }) : null;
	const outboundFetch = mail?.fetch ?? faults.fetch;
	function command(action, options) {
		if (action.startsWith('mail-')) {
			if (!mail) throw new Error('Owned mail sink is not configured.');
			return mail.command(action, options);
		}
		return action.startsWith('fault-') ? faults.command(action, options) : source.command(action, options);
	}
	function restoreAll() {
		source.command('restore');
		faults.command('fault-restore');
		mail?.command('mail-restore');
	}
	const server = createServer((request, response) => {
		if (
			request.method !== 'POST' ||
			request.url !== '/' ||
			request.headers.origin ||
			request.headers.authorization !== `Bearer ${config.token}`
		) {
			response.writeHead(403);
			response.end();
			return;
		}
		let body = '';
		request.on('data', (chunk) => {
			body += chunk;
			if (body.length > 4096) request.destroy();
		});
		request.on('end', () => {
			let result;
			try {
				const { action, ...options } = JSON.parse(body);
				result = command(action, options);
			} catch {
				result = { status: 'BLOCKED', message: 'Invalid or conflicting owned server source control.' };
			}
			response.setHeader('Content-Type', 'application/json');
			response.setHeader('X-T2T-Session', config.sessionId);
			response.end(JSON.stringify(result));
		});
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const originalFetch = globalThis.fetch;
	globalThis.fetch = outboundFetch;
	return {
		port: server.address().port,
		async close() {
			restoreAll();
			if (globalThis.fetch === outboundFetch) globalThis.fetch = originalFetch;
			await new Promise((resolve) => server.close(resolve));
		}
	};
}

const configFile = new URL(import.meta.url).searchParams.get('config');
if (configFile) {
	const directory = path.dirname(configFile);
	const [fileStat, directoryStat] = await Promise.all([fs.lstat(configFile), fs.lstat(directory)]);
	if (
		!path.isAbsolute(configFile) ||
		(await fs.realpath(configFile)) !== configFile ||
		!fileStat.isFile() ||
		fileStat.uid !== process.getuid() ||
		fileStat.mode & 0o077 ||
		!directoryStat.isDirectory() ||
		directoryStat.uid !== process.getuid() ||
		directoryStat.mode & 0o077
	)
		throw new Error('Source controls require a private owned verification configuration.');
	const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
	const control = await startServerSourceControl(config);
	await fs.writeFile(
		path.join(directory, 'server-source-control-ready.json'),
		JSON.stringify({ sessionId: config.sessionId, port: control.port }),
		{ mode: 0o600, flag: 'wx' }
	);
	for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void control.close());
}
