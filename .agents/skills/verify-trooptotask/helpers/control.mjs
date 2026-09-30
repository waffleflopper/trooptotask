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
import { selectAllSupabaseRows } from '../../../../src/lib/server/supabasePagination.server.ts';

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
	organization_rank_catalog: 'organization_id',
	leader_notes: 'organization_id',
	personnel_follow_ups: 'organization_id',
	counseling_records: 'organization_id',
	personnel_documents: 'organization_id',
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
	onboarding_template_steps: 'organization_id',
	personnel_onboardings: 'organization_id',
	onboarding_step_progress: 'organization_id',
	deletion_requests: 'organization_id',
	ict_tasks: 'organization_id',
	personnel_ict_completions: 'organization_id',
	rating_scheme_entries: 'organization_id'
};
const tableSelect = {
	organization_rank_catalog: 'id,organization_id,code,label,service,category,pay_grade,state,source,sort_order',
	training_types:
		'id,organization_id,name,description,expiration_months,warning_days_yellow,warning_days_orange,applies_to_roles,applies_to_mos,applies_to_ranks,excluded_roles,excluded_mos,excluded_ranks,color,sort_order,expiration_date_only,can_be_exempted,exempt_personnel_ids,is_optional',
	training_views: 'id,organization_id,name,column_ids,created_by,created_at,updated_at',
	personnel_trainings:
		'id,organization_id,personnel_id,training_type_id,completion_date,expiration_date,notes,certificate_url',
	onboarding_templates: 'id,organization_id,name,description',
	onboarding_template_steps:
		'id,organization_id,template_id,name,description,step_type,training_type_id,stages,sort_order',
	personnel_onboardings: 'id,organization_id,personnel_id,template_id,started_at,completed_at,cancelled_at,status',
	onboarding_step_progress:
		'id,organization_id,onboarding_id,template_step_id,step_name,step_type,training_type_id,stages,sort_order,completed,current_stage,notes,active',
	deletion_requests: 'id,organization_id,resource_type,resource_id,status',
	rating_scheme_entries:
		'id,organization_id,rated_person_id,eval_type,rater_person_id,rater_name,senior_rater_person_id,senior_rater_name,intermediate_rater_person_id,intermediate_rater_name,reviewer_person_id,reviewer_name,rating_period_start,rating_period_end,status,notes,report_type,workflow_status',
	organization_invitations:
		'id,organization_id,email,status,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids,created_at,expires_at,accepted_at,declined_at,revoked_at,blocked_at',
	organization_invitation_email_outbox:
		'id,organization_id,invitation_id,recipient,purpose,status,attempt_count,updated_at,sent_at'
};
const filters = new Set([
	'id',
	'last_name',
	'first_name',
	'slug',
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
	'ict_task_id',
	'template_id',
	'onboarding_id',
	'template_step_id',
	'rated_person_id'
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
			rankCatalog: fixture.rankCatalog,
			dates: fixture.dates,
			invitationEmails: fixture.invitationEmails,
			notificationUsers: Object.fromEntries(
				Object.keys(fixture.notificationActors).map((role) => [role, fixture.actors[role].id])
			),
			roles: Object.keys(fixture.actors)
		});
		return;
	}
	if (command === 'actor') {
		const [role, destination = 'calendar'] = args;
		const orgDestinations = [
			'evals',
			'personnel',
			'home',
			'training',
			'training/reports',
			'calendar',
			'calendar/settings',
			'calendar/bulk',
			'calendar/reports',
			'critical-tasks',
			'critical-tasks/library',
			'critical-tasks/reports',
			'onboarding',
			'onboarding/templates',
			'onboarding/history',
			'settings/policies',
			'settings/archives',
			'settings/members',
			'settings/exports',
			'settings/danger'
		];
		if (
			!fixture.actors[role] ||
			![...orgDestinations, 'dashboard', 'org/new', 'admin/feedback'].includes(destination) ||
			(fixture.actors[role].organization === null && orgDestinations.includes(destination)) ||
			(destination === 'admin/feedback' && !['platformReviewer', 'platformSupport'].includes(role))
		)
			throw new Error('Unknown synthetic actor or destination.');
		const targetOrg = fixture.actors[role].organization ?? null;
		const destinationPath =
			destination === 'admin/feedback'
				? '/admin/feedback'
				: destination === 'dashboard'
					? '/dashboard?show=all'
					: destination === 'org/new'
						? '/org/new'
						: destination === 'home'
							? `/org/${org(targetOrg)}`
							: `/org/${org(targetOrg)}/${destination}`;
		const readyText =
			destination === 'admin/feedback'
				? ['Beta Feedback', 'Access denied', 'Forbidden']
				: destination.startsWith('onboarding')
					? [
							'STEPS',
							'No templates yet.',
							'Onboarding Pipeline',
							'Onboarding History',
							'Access restricted',
							"You don't have permission to view this page"
						]
					: destination === 'home'
						? ['Verification Organization A', 'Verification Organization B']
						: destination === 'critical-tasks/library'
							? [
									'ICT task library controls',
									'Access Restricted',
									'Access restricted',
									"You don't have permission to view this page"
								]
							: destination === 'critical-tasks'
								? ['Critical Tasks', 'Access restricted']
								: destination === 'settings/archives'
									? ['Archived Records', "You don't have permission to view this page"]
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
														: [
																'Calendar',
																'Evaluation controls',
																'Training',
																'Able, Synthetic',
																'Foreign, Synthetic',
																'No personnel on the active roster',
																'Access restricted',
																'Access Restricted'
															];
		const url = `${doctor.origin}/auth/login?next=${encodeURIComponent(destinationPath)}`;
		const browserContext = `map-${role}-${randomUUID()}`;
		const created = text(await tool(state, 'new_page', { url, isolatedContext: browserContext }));
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
			browserContext,
			orgId: targetOrg ? org(targetOrg) : null,
			path: landed,
			access: page.includes("You don't have permission to view this page") ? 'denied' : 'not-assessed',
			origin: doctor.origin
		});
		return;
	}
	if (command === 'communications') {
		const role = args[0];
		if (!fixture.actors[role]) throw new Error('Use a known synthetic actor.');
		const client = await provider();
		const userId = fixture.actors[role].id;
		const ownedState = await saved();
		const announcementIds = ownedState.seeded
			.filter((item) => item.kind === 'communications' && item.table === 'platform_announcements')
			.flatMap((item) => item.ids);
		const dismissals = announcementIds.length
			? checked(
					await client
						.from('announcement_dismissals')
						.select('announcement_id,user_id,dismissed_at')
						.eq('user_id', userId)
						.in('announcement_id', announcementIds)
				)
			: [];
		const feedback = checked(
			await selectAllSupabaseRows((from, to) =>
				client
					.from('beta_feedback')
					.select(
						'id,user_id,organization_id,organization_name,category,message,page_url,page_section,github_issue_number,github_issue_url,status,admin_notes'
					)
					.eq('user_id', userId)
					.order('id')
					.range(from, to)
			)
		);
		note({ role, userId, dismissals, feedback });
		return;
	}
	if (command === 'rows') {
		const [table, orgKey, field, value] = args;
		if (!tableColumns[table]) throw new Error('Table is outside the synthetic readback allowlist.');
		if (field && (!filters.has(field) || value === undefined)) throw new Error('Use an allowed field and value.');
		const client = await provider();
		const rows = checked(
			await selectAllSupabaseRows(async (from, to) => {
				let query = client
					.from(table)
					.select(tableSelect[table] ?? '*')
					.eq(tableColumns[table], org(orgKey));
				if (field)
					query = query.eq(
						table === 'organization_invitation_email_outbox' && field === 'email' ? 'recipient' : field,
						value
					);
				return query.order('id').range(from, to);
			})
		);
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
		if (
			![
				'duplicate-able',
				'overlap',
				'bulk-501',
				'training-pages',
				'personnel-lifecycle',
				'communications',
				'rating-scheme'
			].includes(kind)
		)
			throw new Error('Unknown temporary seed.');
		const client = await provider();
		const ownedState = await saved();
		const tag = randomUUID().slice(0, 8);
		if (kind === 'rating-scheme') {
			const ids = Object.fromEntries(
				[
					'officer',
					'warrant',
					'nco',
					'archived',
					'overdue',
					'due30',
					'due60',
					'current',
					'completed',
					'changed',
					'bravo',
					'unassigned',
					'archivedEntry',
					'foreign'
				].map((key) => [key, randomUUID()])
			);
			const date = (offset) => {
				const value = new Date(fixture.dates.ui + 'T12:00:00');
				value.setDate(value.getDate() + offset);
				return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
			};
			const people = [
				['officer', '1LT'],
				['warrant', 'CW2'],
				['nco', 'SSG'],
				['archived', 'SGT']
			].map(([key, rank]) => ({
				id: ids[key],
				organization_id: org('orgA'),
				group_id: fixture.ids.groupA,
				first_name: 'Synthetic',
				last_name: `Eval${key}${tag}`,
				rank,
				slug: `map-eval-${key}-${tag}`,
				archived_at: key === 'archived' ? date(-100) + 'T00:00:00Z' : null
			}));
			const examples = [
				['overdue', 'orgA', fixture.ids.personA, 'NCOER', -5, 'active'],
				['due30', 'orgA', ids.nco, 'NCOER', 20, 'active'],
				['due60', 'orgA', ids.officer, 'OER', 45, 'active'],
				['current', 'orgA', ids.warrant, 'WOER', 90, 'active'],
				['completed', 'orgA', ids.nco, 'NCOER', -90, 'completed'],
				['changed', 'orgA', ids.officer, 'OER', 10, 'change-of-rater'],
				['bravo', 'orgA', fixture.ids.personB, 'NCOER', 25, 'active'],
				['unassigned', 'orgA', fixture.ids.personUnassigned, 'NCOER', 15, 'active'],
				['archivedEntry', 'orgA', ids.archived, 'NCOER', -2, 'active'],
				['foreign', 'orgB', fixture.ids.personForeign, 'NCOER', 18, 'active']
			];
			const entries = examples.map(([key, orgKey, personId, evalType, offset, status]) => ({
				id: ids[key],
				organization_id: org(orgKey),
				rated_person_id: personId,
				eval_type: evalType,
				rater_person_id: key === 'due60' ? fixture.ids.personA : null,
				rater_name: key === 'due60' ? null : `External Rater ${key}`,
				senior_rater_name: 'External Senior Rater',
				intermediate_rater_name: key === 'current' ? 'External Intermediate Rater' : null,
				reviewer_name: key === 'current' ? 'External Reviewer' : null,
				rating_period_start: date(-365),
				rating_period_end: date(offset),
				status,
				report_type: key === 'changed' ? 'CR' : 'AN',
				workflow_status: key === 'due30' ? 'with-rater' : null,
				notes: `Synthetic Evals ${key} ${tag}`
			}));
			const batches = [
				['personnel', 'orgA', people],
				['rating_scheme_entries', 'orgA', entries.filter((row) => row.organization_id === org('orgA'))],
				['rating_scheme_entries', 'orgB', entries.filter((row) => row.organization_id === org('orgB'))]
			];
			for (const [table, organization, records] of batches)
				ownedState.seeded.push({ kind, table, organization, ids: records.map((row) => row.id), tag });
			await save(ownedState);
			for (const [table, , records] of batches) checked(await client.from(table).insert(records));
			note({ kind, tag, ids, today: fixture.dates.ui, people, examples: entries });
			return;
		}
		if (kind === 'communications') {
			const notificationIds = {};
			for (const [orgKey, role, count] of [
				['orgA', 'notificationMember', 24],
				['orgA', 'notificationOther', 1],
				['orgB', 'notificationForeign', 1],
				['orgA', 'notificationSwitch', 1],
				['orgB', 'notificationSwitch', 1]
			]) {
				const records = Array.from({ length: count }, (_, index) => ({
					id: randomUUID(),
					organization_id: org(orgKey),
					user_id: fixture.actors[role].id,
					type: 'verification',
					title: `${orgKey} ${role} ${String(index + 1).padStart(2, '0')} ${tag}`,
					message: `Synthetic recipient isolation ${tag}`,
					link:
						role === 'notificationSwitch'
							? `/org/${org(orgKey)}`
							: role === 'notificationMember' && index === count - 1
								? `/org/${org(orgKey)}?notification=${tag}`
								: null,
					read: false,
					created_at: new Date(Date.now() - (count - index) * 60000).toISOString()
				}));
				ownedState.seeded.push({
					kind,
					table: 'notifications',
					organization: orgKey,
					ids: records.map((row) => row.id),
					tag
				});
				await save(ownedState);
				checked(await client.from('notifications').insert(records));
				notificationIds[`${orgKey}-${role}`] = records.map((row) => row.id);
			}
			const announcements = [
				{ state: 'active', is_active: true, expires_at: null },
				{ state: 'inactive', is_active: false, expires_at: null },
				{ state: 'expired', is_active: true, expires_at: '2000-01-01T00:00:00Z' }
			].map(({ state, ...row }) => ({
				...row,
				id: randomUUID(),
				title: `Verification ${state} announcement ${tag}`,
				message: `Synthetic global announcement ${tag}`,
				type: 'info',
				created_by: fixture.actors.orgOwner.id
			}));
			ownedState.seeded.push({ kind, table: 'platform_announcements', ids: announcements.map((row) => row.id), tag });
			await save(ownedState);
			checked(await client.from('platform_announcements').insert(announcements));
			note({ kind, tag, notificationIds, announcements: announcements.map(({ id, title }) => ({ id, title })) });
			return;
		}
		if (kind === 'personnel-lifecycle') {
			const keys = [
				'person',
				'duplicateAlpha',
				'duplicateBravo',
				'archivedDuplicate',
				'noteActive',
				'noteArchived',
				'noteControl',
				'counselingActive',
				'counselingArchived',
				'documentActive',
				'documentArchived',
				'followOpen',
				'followCompleted',
				'followArchived',
				'training',
				'criticalTask'
			];
			const ids = Object.fromEntries(keys.map((key) => [key, randomUUID()]));
			const archivedAt = '2026-08-01T12:00:00.000Z';
			const base = { organization_id: org('orgA'), personnel_id: ids.person };
			const name = `MapLifecycle${tag}`;
			const duplicateName = `MapDuplicate${tag}`;
			const batches = [
				[
					'personnel',
					[
						['person', name, fixture.ids.groupA, null],
						['duplicateAlpha', duplicateName, fixture.ids.groupA, null],
						['duplicateBravo', duplicateName, fixture.ids.groupB, null],
						['archivedDuplicate', duplicateName, fixture.ids.groupA, archivedAt]
					].map(([key, lastName, groupId, archived]) => ({
						id: ids[key],
						organization_id: base.organization_id,
						group_id: groupId,
						first_name: 'Synthetic',
						last_name: lastName,
						rank: 'SPC',
						mos: '68W',
						clinic_role: 'Medic',
						slug: `map-lifecycle-${tag}-${key.toLowerCase()}`,
						archived_at: archived
					}))
				],
				[
					'leader_notes',
					[
						{ ...base, id: ids.noteActive, author: 'Synthetic', text: `Active note ${tag}` },
						{
							...base,
							personnel_id: fixture.ids.personA,
							id: ids.noteControl,
							author: 'Synthetic',
							text: `Unrelated note ${tag}`
						},
						{ ...base, id: ids.noteArchived, author: 'Synthetic', text: `Older note ${tag}`, archived_at: archivedAt }
					]
				],
				[
					'counseling_records',
					['Active', 'Archived'].map((status) => ({
						...base,
						id: ids[`counseling${status}`],
						date_conducted: '2026-09-14',
						subject: `${status} counseling ${tag}`,
						title: `${status} counseling ${tag}`,
						uploaded_by: fixture.actors.manager.id,
						archived_at: status === 'Archived' ? archivedAt : null
					}))
				],
				[
					'personnel_documents',
					['Active', 'Archived'].map((status) => ({
						...base,
						id: ids[`document${status}`],
						title: `${status} document ${tag}`,
						file_path: `${base.organization_id}/${ids.person}/synthetic-${status}.pdf`,
						file_size_bytes: 1,
						content_type: 'application/pdf',
						uploaded_by: fixture.actors.manager.id,
						archived_at: status === 'Archived' ? archivedAt : null
					}))
				],
				[
					'personnel_follow_ups',
					['Open', 'Completed', 'Archived'].map((status) => ({
						...base,
						id: ids[`follow${status}`],
						title: `${status} follow-up ${tag}`,
						status: status.toLowerCase(),
						created_by: fixture.actors.manager.id,
						completed_at: status === 'Completed' ? '2026-09-14T12:00:00.000Z' : null,
						archived_at: status === 'Archived' ? archivedAt : null
					}))
				],
				[
					'personnel_trainings',
					[{ ...base, id: ids.training, training_type_id: fixture.ids.trainingRequired, completion_date: '2026-09-14' }]
				],
				[
					'personnel_ict_completions',
					[
						{
							...base,
							id: ids.criticalTask,
							ict_task_id: fixture.ids.ictTaskAlpha,
							completed_at: '2026-09-14',
							validation_method: 'Demonstration',
							logged_by: fixture.actors.manager.id
						}
					]
				]
			];
			// Record all dependent IDs before any insert so interrupted setup is recoverable.
			for (const [table, records] of batches)
				ownedState.seeded.push({ kind, table, ids: records.map((row) => row.id), tag });
			await save(ownedState);
			for (const [table, records] of batches) checked(await client.from(table).insert(records));
			note({
				kind,
				tag,
				ids,
				name,
				duplicateName,
				archivedAt,
				documentFiles: 'Metadata only; no Storage objects. File lifecycle proof belongs to D13.'
			});
			return;
		}
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
		} else if (kind === 'training-pages') {
			table = 'personnel';
			records = Array.from({ length: 26 }, (_, index) => ({
				id: randomUUID(),
				organization_id: org('orgA'),
				group_id: fixture.ids.groupA,
				first_name: 'Synthetic',
				last_name: `MapTraining${tag}${String(index).padStart(2, '0')}`,
				rank: 'PFC',
				mos: index === 0 ? '68W' : '11B',
				clinic_role: index === 0 ? 'Medic' : 'NCO',
				slug: `map-training-${tag}-${String(index).padStart(2, '0')}`
			}));
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
		for (const item of [...ownedState.seeded].reverse()) {
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
				let query = client.from(item.table).delete().in('id', ids);
				if (item.kind !== 'communications' || item.table !== 'platform_announcements')
					query = query.eq('organization_id', org(item.organization ?? 'orgA'));
				checked(await query);
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
		if (action === 'arm-fail' || action === 'arm-hold' || action === 'arm-observe') {
			if (
				![
					'notifications',
					'rating-scheme',
					'feedback',
					'announcements/dismiss',
					'personnel',
					'personnel/batch',
					'personnel/merge',
					'personnel/archive-batch',
					'calendar-range',
					'availability',
					'availability/batch',
					'sign-in-rosters',
					'training-types',
					'training-views',
					'onboarding-templates',
					'onboarding-template-steps',
					'onboarding-template-steps/reorder',
					'personnel-trainings',
					'personnel-trainings/batch',
					'deletion-requests',
					'deletion-requests/review',
					'training-reports',
					'training-reports/detail',
					'training-reports/export',
					'export',
					'export-excel',
					'personnel-ict-completions',
					'personnel-ict-completions/batch',
					'critical-tasks/reports/summary',
					'critical-tasks/reports/export',
					'critical-tasks/matrix/export'
				].includes(family) &&
				!/^onboarding-templates\/[0-9a-f-]{36}\/duplicate$/.test(family) &&
				!/^sign-in-rosters\/[0-9a-f-]{36}\/upload$/.test(family) &&
				!/^personnel\/[0-9a-f-]{36}\/export$/.test(family)
			)
				throw new Error('Unsupported request family.');
			const ordinal = Number(ordinalText);
			if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error('Ordinal must be a positive integer.');
			const suffix = ['feedback', 'announcements/dismiss'].includes(family)
				? `/api/${family}`
				: `/org/${org('orgA')}/api/${family}`;
			const mode = action === 'arm-fail' ? 'fail' : action === 'arm-hold' ? 'hold' : 'observe';
			const install = `(${installNetworkControl.toString()})(window, ${JSON.stringify({ mode, ordinal, suffix })})`;
			// Onboarding's HTTP adapter captures fetch at creation, so install before page code.
			if (family.startsWith('onboarding-')) {
				const armed = await evaluate(state, pageId, '() => !!window.__mapNetwork');
				if (armed) throw new Error('Restore the existing map network control first');
				await tool(state, 'navigate_page', { pageId, type: 'reload', initScript: install });
			}
			const result = await evaluate(
				state,
				pageId,
				family.startsWith('onboarding-')
					? '() => ({ armed: !!window.__mapNetwork, mode: window.__mapNetwork?.mode, suffix: window.__mapNetwork?.suffix, ordinal: window.__mapNetwork?.ordinal, reloaded: true })'
					: `() => ${install}`
			);
			if (!result.armed || result.mode !== mode || result.suffix !== suffix || result.ordinal !== ordinal)
				throw new Error('Network control was not installed; inspect the owned page before retrying.');
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
				const capture = { original, blob: null, url: null, filename: null, observer: null };
				window.__mapExport = capture;
				URL.createObjectURL = function(blob) {
					capture.blob = blob;
					capture.url = original.call(URL, blob);
					capture.filename = null;
					return capture.url;
				};
				capture.observer = new MutationObserver((records) => {
					for (const record of records) for (const node of record.addedNodes) {
						if (node instanceof HTMLAnchorElement && node.href === capture.url && node.download)
							capture.filename = node.download;
					}
				});
				capture.observer.observe(document.body, { childList: true, subtree: true });
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
					'() => { const c = window.__mapExport; if (!c) return { restored: false }; c.observer.disconnect(); URL.createObjectURL = c.original; delete window.__mapExport; return { restored: true }; }'
				)
			);
			return;
		}
		if (action === 'state') {
			note(
				await evaluate(
					state,
					pageId,
					'() => ({ captured: !!window.__mapExport?.blob, filename: window.__mapExport?.filename ?? null, mimeType: window.__mapExport?.blob?.type ?? null, bytes: window.__mapExport?.blob?.size ?? null })'
				)
			);
			return;
		}
		if (action !== 'save' || !filename) throw new Error('Use export arm, save PAGE FILE, or restore.');
		const target = path.resolve(filename);
		if (!target.startsWith(evidenceRoot + path.sep) || !/\.(xlsx|pdf|json)$/.test(target))
			throw new Error('Export path must be an .xlsx, .pdf or .json under the skill evidence directory.');
		const result = await evaluate(
			state,
			pageId,
			`async () => {
			const blob = window.__mapExport?.blob;
			if (!blob) return { captured: false };
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
			return { captured: true, base64: btoa(binary), filename: window.__mapExport.filename, mimeType: blob.type };
		}`
		);
		if (!result.captured) throw new Error('No workbook Blob was captured.');
		await fs.mkdir(path.dirname(target), { recursive: true });
		const bytes = Buffer.from(result.base64, 'base64');
		await fs.writeFile(target, bytes);
		note({
			saved: target,
			bytes: bytes.length,
			filename: result.filename,
			mimeType: result.mimeType,
			sha256: createHash('sha256').update(bytes).digest('hex')
		});
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
