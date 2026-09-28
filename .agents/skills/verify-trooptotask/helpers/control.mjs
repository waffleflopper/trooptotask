#!/usr/bin/env node
// Controls only this checkout's owned synthetic worker. No claim runner is used.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { repository, sessionPath, readJSON, processIdentity } from '../../../../scripts/verification/core.mjs';
import { installNetworkControl } from './network-control.mjs';

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
	organization_memberships: 'organization_id'
};
const filters = new Set(['id', 'name', 'note', 'personnel_id', 'user_id', 'type']);

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
	if (result.status === 'BLOCKED' || result.isError) throw new Error(result.message ?? `${input.command} failed`);
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
		note({ ids: fixture.ids, dates: fixture.dates, roles: Object.keys(fixture.actors) });
		return;
	}
	if (command === 'actor') {
		const [role, destination = 'calendar'] = args;
		if (
			!fixture.actors[role] ||
			!['personnel', 'calendar', 'calendar/settings', 'calendar/bulk', 'calendar/reports'].includes(destination)
		)
			throw new Error('Unknown synthetic actor or destination.');
		const targetOrg = fixture.calendarActors?.[role]?.organization === 'orgB' || role === 'foreign' ? 'orgB' : 'orgA';
		const url = `${doctor.origin}/auth/login?next=/org/${org(targetOrg)}/${destination}`;
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
		await tool(state, 'wait_for', {
			pageId,
			text: ['Calendar', 'Able, Synthetic', 'Foreign, Synthetic', 'Access restricted'],
			timeout: 20000
		});
		const landed = await evaluate(state, pageId, '() => location.pathname');
		note({ role, pageId, orgId: org(targetOrg), path: landed, origin: doctor.origin });
		return;
	}
	if (command === 'rows') {
		const [table, orgKey, field, value] = args;
		if (!tableColumns[table]) throw new Error('Table is outside the synthetic readback allowlist.');
		if (field && (!filters.has(field) || value === undefined)) throw new Error('Use an allowed field and value.');
		let query = (await provider()).from(table).select('*').eq(tableColumns[table], org(orgKey));
		if (field) query = query.eq(field, value);
		const rows = checked(await query);
		note({ table, organization: orgKey, count: rows.length, rows });
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
		checked(await client.from(table).insert(records));
		ownedState.seeded.push({ kind, table, ids: records.map((record) => record.id), tag });
		await save(ownedState);
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
			if (!['calendar-range', 'availability', 'availability/batch'].includes(family))
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
		if (!target.startsWith(evidenceRoot + path.sep) || !target.endsWith('.xlsx'))
			throw new Error('Export path must be an .xlsx under the skill evidence directory.');
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
		const sheet = book.getWorksheet('Status Days');
		if (!sheet) throw new Error('Workbook has no Status Days sheet.');
		const headers = sheet.getRow(1).values.slice(1).map(String);
		const rows = [];
		for (let i = 2; i <= sheet.rowCount; i++) rows.push(sheet.getRow(i).values.slice(1));
		note({ headers, rows });
		return;
	}
	throw new Error('Use fixture, actor, rows, calendar-grant, seed, clean-seeds, network, export, or workbook.');
}

main().catch((error) => {
	process.stderr.write(`Map control blocked: ${error.message}\n`);
	process.exitCode = 2;
});
