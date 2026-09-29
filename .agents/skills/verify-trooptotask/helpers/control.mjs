#!/usr/bin/env node
// Controls only this checkout's owned synthetic worker. No claim runner is used.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { repository, sessionPath, readJSON, processIdentity } from '../../../../scripts/verification/core.mjs';
import { installNetworkControl } from './network-control.mjs';
import { installFeedbackControl } from './feedback-control.mjs';

const argv = process.argv.slice(2);
const workerIndex = argv.indexOf('--worker');
const worker = workerIndex < 0 ? '1' : argv.splice(workerIndex, 2)[1];
const [command, ...args] = argv;
const session = sessionPath(worker);
const scratch = path.join(session, 'verify-trooptotask-owned.json');
const evidenceRoot = path.join(repository, '.verification/evidence/verify-trooptotask');
const tableColumns = {
	groups: 'organization_id',
	personnel: 'organization_id',
	availability_entries: 'organization_id',
	status_types: 'organization_id',
	assignment_types: 'organization_id',
	daily_assignments: 'organization_id',
	special_days: 'organization_id',
	notifications: 'organization_id',
	audit_logs: 'org_id',
	organization_memberships: 'organization_id',
	organization_invitations: 'organization_id',
	organization_invitation_email_outbox: 'organization_id',
	sign_in_rosters: 'organization_id',
	training_types: 'organization_id',
	training_views: 'organization_id',
	personnel_trainings: 'organization_id',
	onboarding_templates: 'organization_id',
	deletion_requests: 'organization_id',
	ict_tasks: 'organization_id',
	personnel_ict_completions: 'organization_id'
};
const tableSelect = {
	training_types:
		'id,organization_id,name,description,expiration_months,warning_days_yellow,warning_days_orange,applies_to_roles,applies_to_mos,applies_to_ranks,excluded_roles,excluded_mos,excluded_ranks,color,sort_order,expiration_date_only,can_be_exempted,exempt_personnel_ids,is_optional',
	training_views: 'id,organization_id,name,column_ids,created_by,created_at,updated_at',
	personnel_trainings:
		'id,organization_id,personnel_id,training_type_id,completion_date,expiration_date,notes,certificate_url',
	onboarding_templates: 'id,organization_id,name,description',
	deletion_requests: 'id,organization_id,resource_type,resource_id,status',
	organization_invitations:
		'id,organization_id,email,status,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids,created_at,expires_at,accepted_at,declined_at,revoked_at,blocked_at',
	organization_invitation_email_outbox:
		'id,organization_id,invitation_id,recipient,purpose,status,attempt_count,updated_at,sent_at'
};
const filters = new Set([
	'id',
	'name',
	'title',
	'note',
	'date',
	'assignee_id',
	'assignment_type_id',
	'training_type_id',
	'personnel_id',
	'user_id',
	'type',
	'email',
	'status',
	'invitation_id',
	'task_code',
	'ict_task_id'
]);

async function owned() {
	const state = await readJSON(path.join(session, 'session.json'));
	if (state.repository !== repository || state.worker !== worker || state.phase !== 'running')
		throw new Error('This worker is not running for this checkout.');
	const process = await processIdentity(state.supervisor?.pid);
	if (process?.start !== state.supervisor?.start || process?.command !== state.supervisor?.command)
		throw new Error('Owned supervisor is unavailable or replaced.');
	const response = await fetch(`http://127.0.0.1:${state.controlPort}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ command: 'doctor' }),
		signal: AbortSignal.timeout(180000)
	});
	if (!response.ok || response.headers.get('X-T2T-Session') !== state.id)
		throw new Error('Owned supervisor did not authenticate.');
	const doctor = await response.json();
	if (doctor.status !== 'PASS') throw new Error(`Doctor blocked: ${doctor.code ?? doctor.message}`);
	return { state, doctor };
}

async function run(state, input) {
	const response = await fetch(`http://127.0.0.1:${state.controlPort}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
		signal: AbortSignal.timeout(180000)
	});
	if (!response.ok || response.headers.get('X-T2T-Session') !== state.id)
		throw new Error('Owned supervisor did not authenticate.');
	const result = await response.json();
	if (['BLOCKED', 'INCONCLUSIVE', 'FAIL'].includes(result.status) || result.isError)
		throw new Error(result.message ?? text(result) ?? `${input.command} failed`);
	return result;
}

const text = (result) =>
	result.content
		?.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('\n') ?? '';
async function tool(state, name, args) {
	return run(state, { command: 'tool', name, args });
}
async function evaluate(state, pageId, source) {
	const output = text(await tool(state, 'evaluate_script', { pageId, function: source, waitForStableDom: false }));
	const match = output.match(/```json\s*([\s\S]*?)```/);
	if (!match) throw new Error('DevTools evaluation format changed; inspect the native tool output.');
	return JSON.parse(match[1]);
}
async function provider() {
	const config = await readJSON(path.join(session, 'provider.json'));
	const url = new URL(config.API_URL);
	if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Provider is not owned loopback HTTP.');
	return createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
const checked = (result) => {
	if (result.error) throw new Error(`Disposable provider operation failed: ${result.error.message}`);
	return result.data;
};
const note = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
async function saved() {
	try {
		return await readJSON(scratch);
	} catch (error) {
		if (error.code === 'ENOENT') return { seeded: [], grants: [] };
		throw error;
	}
}
async function save(value) {
	await fs.writeFile(scratch, JSON.stringify(value, null, 2), { mode: 0o600 });
}

async function main() {
	const { state, doctor } = await owned();
	const fixture = await readJSON(path.join(session, 'fixtures.json'));
	const org = (key) => {
		if (!['orgA', 'orgB'].includes(key)) throw new Error('Use orgA or orgB.');
		return fixture.ids[key];
	};
	if (command === 'fixture') {
		note({
			ids: fixture.ids,
			dates: fixture.dates,
			invitationEmails: fixture.invitationEmails,
			roles: Object.keys(fixture.actors)
		});
		return;
	}
	if (command === 'actor') {
		const [role, destination = 'calendar'] = args;
		const orgDestinations = [
			'personnel',
			'training',
			'calendar',
			'calendar/settings',
			'calendar/bulk',
			'calendar/reports',
			'critical-tasks',
			'critical-tasks/library',
			'critical-tasks/reports',
			'settings/policies',
			'settings/members',
			'settings/danger'
		];
		if (
			!fixture.actors[role] ||
			![...orgDestinations, 'dashboard', 'org/new'].includes(destination) ||
			(fixture.actors[role].organization === null && orgDestinations.includes(destination))
		)
			throw new Error('Unknown synthetic actor or destination.');
		const targetOrg = fixture.actors[role].organization ?? null;
		const destinationPath =
			destination === 'dashboard'
				? '/dashboard?show=all'
				: destination === 'org/new'
					? '/org/new'
					: `/org/${org(targetOrg)}/${destination}`;
		const readyText =
			destination === 'critical-tasks/library'
				? [
						'ICT task library controls',
						'Access Restricted',
						'Access restricted',
						"You don't have permission to view this page"
					]
				: destination === 'critical-tasks'
					? ['Critical Tasks', 'Access restricted']
					: destination === 'settings/policies'
						? ['Archive Retention', "You don't have permission to view this page"]
						: destination === 'settings/members'
							? ['Access Management', "You don't have permission to view this page"]
							: destination === 'settings/danger'
								? ['Destructive Actions', "You don't have permission to view this page"]
								: destination === 'dashboard'
									? ['Pending Invitations', 'Organizations']
									: destination === 'org/new'
										? ['Create your first Organization', 'Confirm your email first']
										: ['Calendar', 'Training', 'Able, Synthetic', 'Foreign, Synthetic', 'Access restricted'];
		const url = `${doctor.origin}/auth/login?next=${encodeURIComponent(destinationPath)}`;
		const created = text(await tool(state, 'new_page', { url, isolatedContext: `map-${role}-${randomUUID()}` }));
		const pageId = Number(
			created
				.split('\n')
				.find((line) => line.includes('[selected]'))
				?.match(/^(\d+):/)?.[1]
		);
		if (!Number.isInteger(pageId)) throw new Error('New page ID was not returned.');
		const snapshot = text(await tool(state, 'take_snapshot', { pageId }));
		const uid = (label) => {
			const matches = snapshot.split('\n').filter((line) => line.includes(`textbox ${JSON.stringify(label)}`));
			if (matches.length !== 1) throw new Error(`Expected one ${label} field, found ${matches.length}.`);
			return matches[0].match(/uid=([^\s]+)/)?.[1];
		};
		await tool(state, 'fill_form', {
			pageId,
			elements: [
				{ uid: uid('Email Address'), value: fixture.actors[role].email },
				{ uid: uid('Password'), value: fixture.actors[role].password }
			]
		});
		const ready = text(await tool(state, 'take_snapshot', { pageId }));
		const button = ready
			.split('\n')
			.find((line) => line.includes('button "Sign In"'))
			?.match(/uid=([^\s]+)/)?.[1];
		if (!button) throw new Error('Sign In button was not found.');
		await tool(state, 'click', { pageId, uid: button });
		const arrival = await tool(state, 'wait_for', {
			pageId,
			text: readyText,
			timeout: 20000
		});
		if (text(arrival).includes('Timed out')) throw new Error('Destination did not become ready.');
		const landed = await evaluate(state, pageId, '() => location.pathname');
		const page = text(await tool(state, 'take_snapshot', { pageId }));
		note({
			role,
			pageId,
			orgId: targetOrg ? org(targetOrg) : null,
			path: landed,
			access: page.includes("You don't have permission to view this page") ? 'denied' : 'not-assessed',
			origin: doctor.origin
		});
		return;
	}
	if (command === 'rows') {
		const [table, orgKey, field, value] = args;
		if (!tableColumns[table]) throw new Error('Table is outside the synthetic readback allowlist.');
		if (field && (!filters.has(field) || value === undefined)) throw new Error('Use an allowed field and value.');
		let query = (await provider())
			.from(table)
			.select(tableSelect[table] ?? '*')
			.eq(tableColumns[table], org(orgKey));
		if (field)
			query = query.eq(
				table === 'organization_invitation_email_outbox' && field === 'email' ? 'recipient' : field,
				value
			);
		const rows = checked(await query);
		note({ table, organization: orgKey, count: rows.length, rows });
		return;
	}
	if (command === 'created-org') {
		const [name] = args;
		if (!name || name.length > 100) throw new Error('Use the exact synthetic Organization name.');
		const service = await provider();
		const organizations = checked(
			await service
				.from('organizations')
				.select('id,name,created_by,url_slug')
				.eq('created_by', fixture.actors.orgCreator.id)
				.eq('name', name)
		);
		if (organizations.length !== 1) {
			note({ name, count: organizations.length, organizations });
			return;
		}
		const organization = organizations[0];
		const tables = {
			organization_memberships: 'id,user_id,role,email,member_preset,access_scope_kind,access_scope_group_ids',
			groups: 'id,name,sort_order',
			status_types: 'id,name,sort_order',
			assignment_types: 'id,name,short_name,assign_to,sort_order',
			special_days: 'id,date,name,type',
			organization_rank_catalog: 'id,code,service,state,source,sort_order'
		};
		const results = await Promise.all(
			Object.entries(tables).map(async ([table, columns]) => {
				const rows = checked(await service.from(table).select(columns).eq('organization_id', organization.id));
				return [table, { count: rows.length, rows }];
			})
		);
		note({ organization, ...Object.fromEntries(results) });
		return;
	}
	if (command === 'roster-files') {
		const [orgKey, rosterId] = args;
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rosterId ?? ''))
			throw new Error('Use a synthetic roster UUID.');
		const prefix = `${org(orgKey)}/sign-in-rosters/${rosterId}`;
		const bucket = (await provider()).storage.from('counseling-files');
		const entries = checked(await bucket.list(prefix));
		const files = [];
		for (const entry of entries) {
			const blob = checked(await bucket.download(`${prefix}/${entry.name}`));
			const bytes = Buffer.from(await blob.arrayBuffer());
			files.push({ name: entry.name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
		}
		note({ organization: orgKey, rosterId, files });
		return;
	}
	if (command === 'signed-download') {
		const [orgKey, rosterId, filename] = args;
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rosterId ?? ''))
			throw new Error('Use a synthetic roster UUID.');
		const target = path.resolve(filename ?? '');
		if (!target.startsWith(evidenceRoot + path.sep) || !target.endsWith('.pdf'))
			throw new Error('Signed download path must be a .pdf under the skill evidence directory.');
		const client = await provider();
		const rows = checked(
			await client
				.from('sign_in_rosters')
				.select('signed_file_path')
				.eq('organization_id', org(orgKey))
				.eq('id', rosterId)
		);
		if (rows.length !== 1 || !rows[0].signed_file_path?.startsWith(`${org(orgKey)}/sign-in-rosters/${rosterId}/`))
			throw new Error('This synthetic roster has no current signed scan.');
		const marker = `/storage/v1/object/sign/counseling-files/${rows[0].signed_file_path}`;
		const pages = text(await tool(state, 'list_pages', {}));
		const matches = pages.split('\n').filter((line) => {
			const address = line.match(/https?:\/\/\S+/)?.[0];
			if (!address) return false;
			const url = new URL(address);
			return url.origin === new URL(client.supabaseUrl).origin && decodeURIComponent(url.pathname) === marker;
		});
		const pageId = Number(matches.at(-1)?.match(/^(\d+):/)?.[1]);
		if (!Number.isInteger(pageId)) throw new Error('Click the named scan download in the owned browser first.');
		const result = await evaluate(
			state,
			pageId,
			`async () => {
				if (decodeURIComponent(location.pathname) !== ${JSON.stringify(marker)}) throw new Error('Opened scan changed.');
				const response = await fetch(location.href);
				const bytes = new Uint8Array(await response.arrayBuffer());
				let binary = '';
				for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
				return { status: response.status, type: response.headers.get('content-type'), base64: btoa(binary) };
			}`
		);
		const bytes = Buffer.from(result.base64, 'base64');
		if (
			result.status !== 200 ||
			!result.type?.includes('application/pdf') ||
			bytes.subarray(0, 4).toString() !== '%PDF'
		)
			throw new Error('The signed browser download did not return a PDF.');
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, bytes);
		note({ saved: target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
		return;
	}
	if (command === 'calendar-grant') {
		const [role, level] = args;
		if (!fixture.actors[role] || !['none', 'view', 'operate', 'configure', 'restore'].includes(level))
			throw new Error('Unknown synthetic actor or Calendar level.');
		const client = await provider();
		const actor = fixture.actors[role];
		const records = checked(
			await client
				.from('organization_memberships')
				.select('id,capability_overrides')
				.eq('organization_id', org('orgA'))
				.eq('user_id', actor.id)
		);
		if (records.length !== 1) throw new Error('Expected one Organization A membership.');
		const record = records[0];
		const ownedState = await saved();
		let grant = ownedState.grants.find((item) => item.id === record.id);
		if (!grant && level !== 'restore') {
			grant = { id: record.id, original: record.capability_overrides };
			ownedState.grants.push(grant);
			await save(ownedState);
		}
		if (level === 'restore' && !grant) throw new Error('No skill-owned grant change to restore.');
		const next = level === 'restore' ? grant.original : { ...record.capability_overrides, calendar: level };
		checked(await client.from('organization_memberships').update({ capability_overrides: next }).eq('id', record.id));
		if (level === 'restore') {
			ownedState.grants = ownedState.grants.filter((item) => item.id !== record.id);
			await save(ownedState);
		}
		note({ role, calendar: next.calendar });
		return;
	}
	if (command === 'seed') {
		const kind = args[0];
		if (!['duplicate-able', 'overlap', 'bulk-501'].includes(kind)) throw new Error('Unknown temporary seed.');
		const client = await provider();
		const ownedState = await saved();
		const tag = randomUUID().slice(0, 8);
		let table, records;
		if (kind === 'duplicate-able') {
			table = 'personnel';
			records = [
				{
					id: randomUUID(),
					organization_id: org('orgA'),
					group_id: fixture.ids.groupA,
					first_name: 'Synthetic',
					last_name: 'Able',
					rank: 'PFC',
					clinic_role: '',
					slug: `map-duplicate-${tag}`
				}
			];
		} else if (kind === 'overlap') {
			table = 'availability_entries';
			records = [
				{
					id: randomUUID(),
					organization_id: org('orgA'),
					personnel_id: fixture.ids.personA,
					status_type_id: fixture.ids.statusLeave,
					start_date: fixture.dates.uiBefore,
					end_date: fixture.dates.uiAfter,
					note: `Map overlap ${tag}`
				}
			];
		} else {
			table = 'personnel';
			records = Array.from({ length: 501 }, (_, index) => ({
				id: randomUUID(),
				organization_id: org('orgA'),
				group_id: fixture.ids.groupA,
				first_name: 'Synthetic',
				last_name: `MapChunk${tag}${String(index).padStart(3, '0')}`,
				rank: 'SPC',
				clinic_role: '',
				slug: `map-chunk-${tag}-${String(index).padStart(3, '0')}`
			}));
		}
		ownedState.seeded.push({ kind, table, ids: records.map((record) => record.id), tag });
		await save(ownedState);
		checked(await client.from(table).insert(records));
		note({ kind, tag, count: records.length, firstId: records[0].id });
		return;
	}
	if (command === 'clean-seeds') {
		const client = await provider();
		const ownedState = await saved();
		for (const item of ownedState.seeded) {
			for (let offset = 0; offset < item.ids.length; offset += 100) {
				const ids = item.ids.slice(offset, offset + 100);
				if (item.kind === 'bulk-501')
					checked(
						await client
							.from('availability_entries')
							.delete()
							.eq('organization_id', org('orgA'))
							.in('personnel_id', ids)
					);
				checked(await client.from(item.table).delete().eq('organization_id', org('orgA')).in('id', ids));
			}
		}
		ownedState.seeded = [];
		await save(ownedState);
		note({ cleaned: true });
		return;
	}
	if (command === 'network') {
		const [action, page, family, ordinalText = '1'] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1) throw new Error('Use a page ID from the owned browser.');
		if (action === 'arm-fail' || action === 'arm-hold') {
			if (
				![
					'calendar-range',
					'availability',
					'availability/batch',
					'sign-in-rosters',
					'training-types',
					'training-views',
					'personnel-trainings',
					'personnel-trainings/batch',
					'deletion-requests',
					'deletion-requests/review',
					'training-reports',
					'training-reports/detail',
					'training-reports/export',
					'personnel-ict-completions',
					'personnel-ict-completions/batch',
					'critical-tasks/reports/summary',
					'critical-tasks/reports/export',
					'critical-tasks/matrix/export'
				].includes(family) &&
				!/^sign-in-rosters\/[0-9a-f-]{36}\/upload$/.test(family)
			)
				throw new Error('Unsupported request family.');
			const ordinal = Number(ordinalText);
			if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error('Ordinal must be a positive integer.');
			const suffix = `/org/${org('orgA')}/api/${family}`;
			const mode = action === 'arm-fail' ? 'fail' : 'hold';
			const result = await evaluate(
				state,
				pageId,
				`() => (${installNetworkControl.toString()})(window, ${JSON.stringify({ mode, ordinal, suffix })})`
			);
			note(result);
			return;
		}
		if (!['state', 'release', 'restore'].includes(action)) throw new Error('Unknown network action.');
		const source =
			action === 'state'
				? '() => ({ armed: !!window.__mapNetwork, calls: window.__mapNetwork?.calls ?? [], held: !!window.__mapNetwork?.release })'
				: action === 'release'
					? '() => { const c = window.__mapNetwork; if (!c?.release) return { released: false }; c.release(); c.release = null; return { released: true }; }'
					: '() => { const c = window.__mapNetwork; if (!c) return { restored: false }; c.release?.(); window.fetch = c.original; delete window.__mapNetwork; return { restored: true }; }';
		note(await evaluate(state, pageId, source));
		return;
	}
	if (command === 'feedback') {
		const [action, page] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1) throw new Error('Use a page ID from the owned browser.');
		if (!['arm', 'state', 'restore'].includes(action)) throw new Error('Unknown feedback action.');
		const source =
			action === 'arm'
				? `() => (${installFeedbackControl.toString()})(window)`
				: action === 'state'
					? '() => ({ armed: !!window.__mapFeedback, entries: window.__mapFeedback?.entries ?? [] })'
					: '() => { const c = window.__mapFeedback; if (!c) return { restored: false }; c.observer.disconnect(); delete window.__mapFeedback; return { restored: true }; }';
		note(await evaluate(state, pageId, source));
		return;
	}
	if (command === 'export') {
		const [action, page, filename] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1) throw new Error('Use a page ID from the owned browser.');
		if (action === 'arm') {
			note(
				await evaluate(
					state,
					pageId,
					`() => {
				if (window.__mapExport) throw new Error('Restore the previous export capture first');
				const original = URL.createObjectURL;
				window.__mapExport = { original, blob: null };
				URL.createObjectURL = function(blob) { window.__mapExport.blob = blob; return original.call(URL, blob); };
				return { armed: true };
			}`
				)
			);
			return;
		}
		if (action === 'restore') {
			note(
				await evaluate(
					state,
					pageId,
					'() => { const c = window.__mapExport; if (!c) return { restored: false }; URL.createObjectURL = c.original; delete window.__mapExport; return { restored: true }; }'
				)
			);
			return;
		}
		if (action !== 'save' || !filename) throw new Error('Use export arm, save PAGE FILE, or restore.');
		const target = path.resolve(filename);
		if (!target.startsWith(evidenceRoot + path.sep) || !/\.(xlsx|pdf)$/.test(target))
			throw new Error('Export path must be an .xlsx or .pdf under the skill evidence directory.');
		const result = await evaluate(
			state,
			pageId,
			`async () => {
			const blob = window.__mapExport?.blob;
			if (!blob) return { captured: false };
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
			return { captured: true, base64: btoa(binary) };
		}`
		);
		if (!result.captured) throw new Error('No workbook Blob was captured.');
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, Buffer.from(result.base64, 'base64'));
		note({ saved: target, bytes: (await fs.stat(target)).size });
		return;
	}
	if (command === 'workbook') {
		const target = path.resolve(args[0] ?? '');
		if (!target.startsWith(evidenceRoot + path.sep))
			throw new Error('Workbook must be under the skill evidence directory.');
		const book = new ExcelJS.Workbook();
		await book.xlsx.readFile(target);
		const sheetName = args[1] ?? 'Status Days';
		const sheet = book.getWorksheet(sheetName);
		if (!sheet)
			throw new Error(
				`Workbook has no ${sheetName} sheet; found ${book.worksheets.map((entry) => entry.name).join(', ')}.`
			);
		const headers = sheet.getRow(1).values.slice(1).map(String);
		const rows = [];
		for (let i = 2; i <= sheet.rowCount; i++) rows.push(sheet.getRow(i).values.slice(1));
		note({ sheet: sheetName, headers, rows });
		return;
	}
	throw new Error(
		'Use fixture, actor, rows, roster-files, signed-download, calendar-grant, seed, clean-seeds, network, export, or workbook.'
	);
}

main().catch((error) => {
	process.stderr.write(`Map control blocked: ${error.message}\n`);
	process.exitCode = 2;
});
