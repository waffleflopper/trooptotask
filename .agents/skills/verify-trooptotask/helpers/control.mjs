#!/usr/bin/env node
import { registeredFixtureFileWrite } from '../../../../scripts/verification/registered-file-upload.mjs';
import { isUnderEvidence } from '../../../../scripts/verification/browser.mjs';
// Controls only this checkout's owned synthetic worker. No claim runner is used.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import {
	repository,
	sessionPath,
	readJSON,
	writeJSON,
	processIdentity,
	environment,
	recordingTransition
} from '../../../../scripts/verification/core.mjs';
import { installNetworkControl } from './network-control.mjs';
import { installBusyControl } from './busy-control.mjs';
import { requestSettings } from './settings-request.mjs';
import { seedDeletionSources, requestDeletion, requestPersonnelArchiveBatch } from './deletion-requests.mjs';
import { requestOnboarding, readOnboardingRequests } from './onboarding-request.mjs';
import { installFeedbackControl } from './feedback-control.mjs';
import { readStyleProbe, diffStyleProbes, styleProperties, resolveStyleSelectors } from './style-probe.mjs';
import { parseSweepArguments, runSweep, toolbarReadSource } from './toolbar-sweep.mjs';
import { observePrint } from './print-observation.mjs';
import { probeAdmission } from './admission-probe.mjs';
import { seedPersonnelRetention, readRetentionFiles } from './personnel-retention.mjs';
import { seedArtifactRetention } from './artifact-retention.mjs';
import { seedMaintenance, readMaintenance } from './maintenance-fixtures.mjs';
import { seedOnboarding } from './onboarding-fixtures.mjs';
import { buildAvailabilityVolume } from './availability-volume-fixture.mjs';
import { seedAudit } from './audit-fixtures.mjs';
import { seedDashboard, seedDashboardCurrency, seedDashboardOverflow } from './dashboard-fixtures.mjs';
import { seedTrainingPrint, cleanTrainingPrint } from './training-print-fixtures.mjs';
import {
	seedPlatform,
	seedOrganizationPages,
	readPlatform,
	cleanPlatform,
	recordPlatformUserAudit
} from './platform-fixtures.mjs';
import { requestPlatform } from './platform-request.mjs';
import { platformFormNetworkTarget } from './platform-network-target.mjs';
import { requestAuditTrainingUpdate } from './audit-request.mjs';
import { artifactHttp, clearArtifactHttpCache } from './artifact-http.mjs';
import { insertRosterWithId, cleanRosterInserts, recordedRosterInsertTarget } from './roster-insert.mjs';
import {
	seedRosterSharedKeys,
	releaseSharedKey,
	probeSharedKeyReuse,
	cleanRosterSharedKeys
} from './roster-shared-keys.mjs';
import {
	accountSetupSeed,
	authConfirmUrl,
	identityEmails,
	mailKind,
	mailRequest,
	readAccessRequests,
	faultRequest,
	redactAuthTokens,
	setupAccountUrl,
	syntheticEmail,
	textboxUid
} from './identity-controls.mjs';
import {
	prepareUploadOverlap,
	inspectUploadOverlap,
	deleteAfterUploadOverlap
} from './organization-upload-overlap.mjs';
import { selectAllSupabaseRows } from '../../../../src/lib/server/supabasePagination.server.ts';

const argv = process.argv.slice(2);
const workerIndex = argv.indexOf('--worker');
const worker = workerIndex < 0 ? '1' : argv.splice(workerIndex, 2)[1];
const [command, ...args] = argv;
const session = sessionPath(worker);
const scratch = path.join(session, 'verify-trooptotask-owned.json');
const evidenceRoot = path.join(repository, '.verification/evidence/verify-trooptotask');
const tableColumns = {
	organizations: 'id',
	groups: 'organization_id',
	personnel: 'organization_id',
	personnel_extended_info: 'organization_id',
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
	data_exports: 'org_id',
	organization_memberships: 'organization_id',
	organization_invitations: 'organization_id',
	organization_invitation_email_outbox: 'organization_id',
	access_request_organization_invitation_links: 'organization_id',
	dashboard_configs: 'org_id',
	getting_started_progress: 'organization_id',
	user_org_preferences: 'organization_id',
	user_pinned_groups: 'organization_id',
	beta_feedback: 'organization_id',
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
	organizations:
		'id,name,url_slug,created_by,created_at,suspended_at,archive_retention_months,loss_warning_window_days,personnel_document_storage_cap_bytes,critical_tasks_default_expiration_months,critical_tasks_expiring_soon_warning_days,training_readiness_goal_percent',
	personnel_extended_info:
		'id,organization_id,personnel_id,blood_type,basd,date_of_rank,marital_status,number_of_dependents,children,civilian_education,military_education,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,spouse_name,spouse_phone,vehicle_make_model,vehicle_plate,vehicle_color,personal_email,personal_phone,address_street,address_city,address_state,address_zip,award_tracking_acknowledged_at,created_at,updated_at',
	organization_rank_catalog:
		'id,organization_id,code,label,service,category,pay_grade,state,source,sort_order,created_at,updated_at',
	training_types:
		'id,organization_id,name,description,expiration_months,warning_days_yellow,warning_days_orange,applies_to_roles,applies_to_mos,applies_to_ranks,excluded_roles,excluded_mos,excluded_ranks,color,sort_order,expiration_date_only,can_be_exempted,exempt_personnel_ids,is_optional,created_at',
	training_views: 'id,organization_id,name,column_ids,created_by,created_at,updated_at',
	personnel_trainings:
		'id,organization_id,personnel_id,training_type_id,completion_date,expiration_date,notes,certificate_url,created_at,updated_at',
	onboarding_templates: 'id,organization_id,name,description,created_at',
	onboarding_template_steps:
		'id,organization_id,template_id,name,description,step_type,training_type_id,stages,sort_order,created_at',
	personnel_onboardings:
		'id,organization_id,personnel_id,template_id,started_at,completed_at,cancelled_at,status,created_at',
	onboarding_step_progress:
		'id,organization_id,onboarding_id,template_step_id,step_name,step_type,training_type_id,stages,sort_order,completed,current_stage,notes,active,progress_changed_at,updated_at',
	deletion_requests:
		'id,organization_id,requested_by,requested_by_email,resource_type,resource_id,resource_description,resource_url,status,denial_reason,reviewed_by,reviewed_at,created_at',
	rating_scheme_entries:
		'id,organization_id,rated_person_id,eval_type,rater_person_id,rater_name,senior_rater_person_id,senior_rater_name,intermediate_rater_person_id,intermediate_rater_name,reviewer_person_id,reviewer_name,rating_period_start,rating_period_end,status,notes,report_type,workflow_status,created_at,updated_at',
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
	'action',
	'email',
	'status',
	'invitation_id',
	'task_code',
	'ict_task_id',
	'template_id',
	'onboarding_id',
	'template_step_id',
	'rated_person_id',
	'resource_id',
	'requested_by'
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

async function deletionReviewFailure(action, requestId) {
	if (!['arm', 'restore', 'state'].includes(action) || (action === 'arm' && !requestId))
		throw new Error('Use deletion-review-failure arm|restore|state [REQUEST_ID].');
	let stdout;
	try {
		({ stdout } = await promisify(execFile)(
			'python3',
			[
				path.join(repository, 'scripts/verification/environment.py'),
				'deletion-review-failure',
				session,
				action,
				...(requestId ? [requestId] : [])
			],
			{ maxBuffer: 1024 * 1024 }
		));
	} catch {
		throw new Error('Owned deletion review failure control blocked; inspect its sanitized state command.');
	}
	const result = JSON.parse(stdout);
	if (result.status !== 'PASS') throw new Error('Owned deletion review failure control did not pass.');
	return result;
}

async function main() {
	const { state, doctor } = await owned();
	const fixture = await readJSON(path.join(session, 'fixtures.json'));
	const org = (key) => {
		if (!['orgA', 'orgB'].includes(key)) throw new Error('Use orgA or orgB.');
		return fixture.ids[key];
	};
	if (command === 'print') {
		const [action, page, expectedUrl, filePath, paperSize = 'letter', backgrounds = 'on'] = args;
		const pageId = Number(page);
		if (
			!Number.isSafeInteger(pageId) ||
			pageId < 1 ||
			(action === 'save'
				? args.length < 4 ||
					args.length > 6 ||
					!['letter', 'a4'].includes(paperSize) ||
					!['on', 'off'].includes(backgrounds)
				: args.length !== 2 || !['arm', 'state', 'restore'].includes(action))
		)
			throw new Error(
				'Use print arm|state|restore PAGE, or print save PAGE EXACT_REPORT_URL FILE.pdf [letter|a4] [on|off].'
			);
		if (action === 'save')
			note(
				await run(state, {
					command: 'print-capture',
					pageId,
					expectedUrl,
					filePath,
					paperSize,
					printBackground: backgrounds === 'on'
				})
			);
		else note(await evaluate(state, pageId, `() => (${observePrint.toString()})(window, ${JSON.stringify(action)})`));
		return;
	}
	if (command === 'server-source') {
		const [action, table, mode, ordinal, holdMs] = args;
		if (
			!['arm', 'state', 'release', 'restore'].includes(action) ||
			(action === 'arm' ? args.length < 3 || args.length > 5 : args.length !== 1)
		)
			throw new Error('Use server-source arm TABLE hold|fail|fail-hard [ORDINAL] [HOLD_MS], or state|release|restore.');
		note(
			await run(state, {
				command: 'server-source',
				action,
				table,
				mode,
				...(ordinal === undefined ? {} : { ordinal: Number(ordinal) }),
				...(holdMs === undefined ? {} : { holdMs: Number(holdMs) })
			})
		);
		return;
	}
	if (command === 'mail') {
		note(await run(state, mailRequest(args)));
		return;
	}
	if (command === 'fault') {
		note(await run(state, faultRequest(args)));
		return;
	}
	if (command === 'mail-link') {
		const [page, email, kind, ordinal] = args;
		const pageId = Number(page);
		if (args.length < 3 || args.length > 4 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use mail-link PAGE EMAIL setup|auth|invitation [N].');
		if ((await evaluate(state, pageId, '() => location.origin')) !== doctor.origin)
			throw new Error('The page is not on the owned app origin.');
		const opened = await run(state, {
			command: 'mail-link',
			pageId,
			email: syntheticEmail(email),
			kind: mailKind(kind),
			...(ordinal === undefined ? {} : { ordinal: Number(ordinal) })
		});
		note({ ...opened, snapshot: redactAuthTokens(opened.snapshot) });
		return;
	}
	if (command === 'deletion-review-failure') {
		if (args.length < 1 || args.length > 2)
			throw new Error('Use deletion-review-failure arm|restore|state [REQUEST_ID].');
		note(await deletionReviewFailure(...args));
		return;
	}
	if (command === 'platform-audit') {
		note(
			await recordPlatformUserAudit({
				client: await provider(),
				ownedState: await saved(),
				ids: JSON.parse(args[0] ?? 'null'),
				save
			})
		);
		return;
	}
	if (command === 'platform-state') {
		note(await readPlatform({ client: await provider(), fixture, ownedState: await saved() }));
		return;
	}
	if (command === 'content-request') {
		const [page, family, targetId, bodyText = '{}'] = args;
		const pageId = Number(page);
		if (
			args.length < 3 ||
			args.length > 4 ||
			!Number.isInteger(pageId) ||
			pageId < 1 ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId ?? '')
		)
			throw new Error('Use content-request PAGE FAMILY RECORDED_UUID JSON.');
		const client = await provider();
		if (['announcementCreate', 'announcementToggle', 'announcementDelete'].includes(family)) {
			const seedIds = (await saved()).seeded
				.filter((item) => item.kind === 'communications' && item.table === 'platform_announcements')
				.flatMap((item) => item.ids);
			const row = checked(
				await client.from('platform_announcements').select('id,created_by').eq('id', targetId).maybeSingle()
			);
			if (!row || (!seedIds.includes(targetId) && row.created_by !== fixture.actors.platformReviewer.id))
				throw new Error('Use a saved announcement owned by this verification worker.');
		} else if (family === 'feedbackUpdate') {
			const row = checked(await client.from('beta_feedback').select('id,user_id').eq('id', targetId).maybeSingle());
			if (!row || !Object.values(fixture.actors).some((actor) => actor.id === row.user_id))
				throw new Error("Use Feedback submitted by this worker's synthetic account.");
		} else throw new Error('Unsupported content request family.');
		note(
			await evaluate(
				state,
				pageId,
				`async () => (${requestPlatform.toString()})(window, ${JSON.stringify({ origin: doctor.origin, family, targetId, body: JSON.parse(bodyText) })})`
			)
		);
		return;
	}
	if (command === 'platform-request') {
		const [page, family, targetKey, bodyText = '{}'] = args;
		const pageId = Number(page);
		if (args.length < 3 || args.length > 4 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use platform-request PAGE FAMILY TARGET_KEY JSON.');
		const seed = (await saved()).platform;
		if (!seed) throw new Error('Seed platform-admin first.');
		const body = JSON.parse(bodyText);
		const access = ['approve', 'reject', 'resend'].includes(family);
		const membership = ['makeAdmin', 'transferOwnership'].includes(family);
		const targetId = access
			? seed.requests[targetKey]?.id
			: membership
				? targetKey === 'organization'
					? seed.organization.id
					: null
				: family === 'suspend' && body.type === 'org'
					? targetKey === 'organization'
						? seed.organization.id
						: null
					: ['orgCreator', 'orgInvitee', 'orgMember'].includes(targetKey)
						? fixture.actors[targetKey].id
						: null;
		if (!targetId) throw new Error('Unknown recorded platform target.');
		if (membership && body.targetUserId && !seed.memberships.some((row) => row.user_id === body.targetUserId))
			throw new Error('Use a member of the temporary platform Organization.');
		note(
			await evaluate(
				state,
				pageId,
				`async () => (${requestPlatform.toString()})(window, ${JSON.stringify({ origin: doctor.origin, family, targetId, body })})`
			)
		);
		return;
	}
	if (command === 'artifact-http') {
		note(await artifactHttp({ origin: doctor.origin, fixture, evidenceRoot, session, sessionId: state.id, args }));
		return;
	}
	if (command === 'fixture') {
		note({
			ids: fixture.ids,
			rankCatalog: fixture.rankCatalog,
			dates: fixture.dates,
			invitationEmails: fixture.invitationEmails,
			identityEmails: identityEmails(fixture),
			notificationUsers: Object.fromEntries(
				Object.keys(fixture.notificationActors).map((role) => [role, fixture.actors[role].id])
			),
			roles: Object.keys(fixture.actors)
		});
		return;
	}
	if (command === 'preferences') {
		const [role, orgKey] = args;
		if (args.length !== 2 || !fixture.actors[role]) throw new Error('Use a known synthetic role and Organization.');
		const userId = fixture.actors[role].id;
		const organizationId = org(orgKey);
		const client = await provider();
		const preferences = checked(
			await client
				.from('user_org_preferences')
				.select('id,user_id,organization_id,preferences')
				.eq('user_id', userId)
				.eq('organization_id', organizationId)
		);
		const progress = checked(
			await client
				.from('getting_started_progress')
				.select('*')
				.eq('user_id', userId)
				.eq('organization_id', organizationId)
		);
		note({ role, userId, organization: orgKey, organizationId, preferences, progress });
		return;
	}
	if (command === 'deletion-request') {
		const [page, orgKey, action, bodyText = '{}'] = args;
		const pageId = Number(page);
		if (args.length < 3 || args.length > 4 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use deletion-request PAGE orgA|orgB list|submit|cancel|review JSON.');
		note(
			await evaluate(
				state,
				pageId,
				`async () => (${requestDeletion.toString()})(window, ${JSON.stringify({ origin: doctor.origin, orgId: org(orgKey), action, body: JSON.parse(bodyText) })})`
			)
		);
		return;
	}
	if (command === 'personnel-archive-batch') {
		const [page, orgKey, idsText] = args;
		const pageId = Number(page);
		if (args.length !== 3 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use personnel-archive-batch PAGE orgA|orgB JSON_UUID_ARRAY.');
		note(
			await evaluate(
				state,
				pageId,
				`async () => (${requestPersonnelArchiveBatch.toString()})(window, ${JSON.stringify({ origin: doctor.origin, orgId: org(orgKey), ids: JSON.parse(idsText) })})`
			)
		);
		return;
	}
	if (command === 'audit-training-update') {
		const [page, orgKey, bodyText] = args;
		const pageId = Number(page);
		if (args.length !== 3 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use audit-training-update PAGE orgA|orgB JSON.');
		note(
			await evaluate(
				state,
				pageId,
				`async () => (${requestAuditTrainingUpdate.toString()})(window, ${JSON.stringify({ origin: doctor.origin, orgId: org(orgKey), body: JSON.parse(bodyText) })})`
			)
		);
		return;
	}
	if (command === 'settings-request') {
		const [page, orgKey, family, bodyText] = args;
		const pageId = Number(page);
		if (args.length !== 4 || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use settings-request PAGE orgA|orgB FAMILY JSON.');
		const organization = checked(
			await (await provider()).from('organizations').select('url_slug').eq('id', org(orgKey)).single()
		);
		const input = {
			origin: doctor.origin,
			organizationSegment: organization.url_slug || org(orgKey),
			family,
			body: JSON.parse(bodyText)
		};
		note(
			await evaluate(state, pageId, `async () => (${requestSettings.toString()})(window, ${JSON.stringify(input)})`)
		);
		return;
	}
	if (command === 'reauth') {
		const [page, role] = args;
		const pageId = Number(page);
		if (args.length !== 2 || !Number.isInteger(pageId) || pageId < 1 || !fixture.actors[role])
			throw new Error('Use reauth PAGE FIXTURE_ROLE on the normal owned password confirmation page.');
		const location = new URL(await evaluate(state, pageId, '() => location.href'));
		if (
			location.origin !== doctor.origin ||
			location.pathname !== '/auth/login' ||
			location.searchParams.get('reauth') !== '1'
		)
			throw new Error('Use the existing owned reauthentication handoff; no navigation or session is injected.');
		const snapshot = text(await tool(state, 'take_snapshot', { pageId }));
		const uid = (label) => {
			const matches = snapshot.split('\n').filter((line) => line.includes(`textbox ${JSON.stringify(label)}`));
			if (matches.length !== 1) throw new Error('Normal confirmation fields are unavailable.');
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
		if (!button) throw new Error('Normal confirmation submit is unavailable.');
		await tool(state, 'click', { pageId, uid: button });
		await tool(state, 'wait_for', { pageId, text: ['Destructive Actions'], timeout: 20000 });
		note({
			pageId,
			role,
			handoff: location.pathname + location.search,
			returnedPath: await evaluate(state, pageId, '() => location.pathname'),
			snapshot: text(await tool(state, 'take_snapshot', { pageId }))
		});
		return;
	}
	const identityPage = async (page, role) => {
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1 || !fixture.identityActors.includes(role))
			throw new Error('Use an owned page ID and an identity fixture role.');
		if ((await evaluate(state, pageId, '() => location.origin')) !== doctor.origin)
			throw new Error('The page is not on the owned app origin.');
		return pageId;
	};
	const fillPrivate = async (pageId, label, occurrence, value) => {
		const uid = textboxUid(text(await tool(state, 'take_snapshot', { pageId })), label, occurrence);
		await tool(state, 'fill', { pageId, uid, value });
	};
	const pendingPasswords = path.join(session, 'identity-pending-passwords.json');
	if (command === 'mfa-code') {
		const [page, role, label, occurrence] = args;
		const pageId = await identityPage(page, role);
		if (!label) throw new Error('Use mfa-code PAGE ROLE LABEL [OCCURRENCE].');
		const { factor, code } = await environment('totp-code', session, fixture.actors[role].id);
		await fillPrivate(pageId, label, occurrence, code);
		note({ pageId, role, label, occurrence: occurrence ?? 1, factor, filled: true });
		return;
	}
	if (command === 'session-count') {
		const [role] = args;
		if (!fixture.identityActors.includes(role)) throw new Error('Use session-count IDENTITY_ROLE.');
		const result = await environment('session-count', session, fixture.actors[role].id);
		note({ role, sessions: result.sessions });
		return;
	}
	if (command === 'admission-probe') {
		const [role, otherRole] = args;
		if (!fixture.actors[role]?.password || !fixture.actors[otherRole]?.id || role === otherRole)
			throw new Error('Use admission-probe ROLE OTHER_ROLE with two synthetic actors.');
		const config = await readJSON(path.join(session, 'provider.json'));
		note(
			await probeAdmission({
				origin: doctor.origin,
				providerUrl: config.API_URL,
				anonKey: config.ANON_KEY,
				email: fixture.actors[role].email,
				password: fixture.actors[role].password,
				otherUserId: fixture.actors[otherRole].id,
				fetch
			})
		);
		return;
	}
	if (command === 'session-age') {
		const [role, hours] = args;
		if (!fixture.identityActors.includes(role) || !/^\d{1,2}$/.test(hours ?? ''))
			throw new Error('Use session-age IDENTITY_ROLE HOURS (1–48).');
		const result = await environment('session-age', session, fixture.actors[role].id, hours);
		note({ role, sessions: result.sessions, hours: result.hours });
		return;
	}
	if (command === 'password') {
		const [page, role, which, label, occurrence] = args;
		const pageId = await identityPage(page, role);
		if (!['current', 'next'].includes(which) || !label)
			throw new Error('Use password PAGE ROLE current|next LABEL [OCCURRENCE].');
		let pending = {};
		try {
			pending = await readJSON(pendingPasswords);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		if (which === 'next' && !pending[role]) {
			pending[role] = `Synthetic-${randomUUID()}!9`;
			await writeJSON(pendingPasswords, pending);
		}
		await fillPrivate(pageId, label, occurrence, which === 'next' ? pending[role] : fixture.actors[role].password);
		note({ pageId, role, which, label, occurrence: occurrence ?? 1, filled: true });
		return;
	}
	if (command === 'password-commit') {
		const [role] = args;
		const pending = await readJSON(pendingPasswords);
		if (!fixture.identityActors.includes(role) || !pending[role])
			throw new Error('No pending synthetic password exists for this identity role.');
		fixture.actors[role].password = pending[role];
		await writeJSON(path.join(session, 'fixtures.json'), fixture);
		delete pending[role];
		await writeJSON(pendingPasswords, pending);
		note({ role, committed: true });
		return;
	}
	if (command === 'auth-link') {
		const [page, type, role] = args;
		const pageId = Number(page);
		if (
			!Number.isInteger(pageId) ||
			pageId < 1 ||
			(type === 'recovery' ? !fixture.identityActors.includes(role) : type !== 'invite' || args.length !== 2)
		)
			throw new Error('Use auth-link PAGE recovery IDENTITY_ROLE or auth-link PAGE invite.');
		if ((await evaluate(state, pageId, '() => location.origin')) !== doctor.origin)
			throw new Error('The page is not on the owned app origin.');
		const email = type === 'recovery' ? fixture.actors[role].email : `identity-invite-${randomUUID()}@example.test`;
		const link = checked(await (await provider()).auth.admin.generateLink({ type, email }));
		const tokenHash = link.properties?.hashed_token;
		if (!tokenHash || link.properties.verification_type !== type || link.user?.email !== email.toLowerCase())
			throw new Error('The provider returned an unexpected link identity or type.');
		await tool(state, 'navigate_page', { pageId, type: 'url', url: authConfirmUrl(doctor.origin, type, tokenHash) });
		const snapshot = redactAuthTokens(text(await tool(state, 'take_snapshot', { pageId })));
		if (snapshot.includes(tokenHash)) throw new Error('Link token survived redaction; refusing to print.');
		note({ pageId, type, email, path: '/auth/confirm', snapshot });
		return;
	}
	if (command === 'setup-link') {
		const [page, kind] = args;
		const pageId = Number(page);
		const rawToken = (await saved()).accountSetup?.tokens?.[kind];
		if (args.length !== 2 || !Number.isInteger(pageId) || pageId < 1 || !rawToken)
			throw new Error('Use setup-link PAGE CLASS after seed account-setup.');
		if ((await evaluate(state, pageId, '() => location.origin')) !== doctor.origin)
			throw new Error('The page is not on the owned app origin.');
		await tool(state, 'navigate_page', { pageId, type: 'url', url: setupAccountUrl(doctor.origin, rawToken) });
		const snapshot = redactAuthTokens(text(await tool(state, 'take_snapshot', { pageId })));
		if (snapshot.includes(rawToken)) throw new Error('Setup token survived redaction; refusing to print.');
		note({ pageId, class: kind, path: '/auth/setup-account', snapshot });
		return;
	}
	if (command === 'access-request') {
		note(await readAccessRequests(await provider(), syntheticEmail(args[0])));
		return;
	}
	if (command === 'onboarding-request') {
		const [page, orgKey, method, family, bodyText, mode = 'await'] = args;
		const pageId = Number(page);
		if (![5, 6].includes(args.length) || !Number.isInteger(pageId) || pageId < 1)
			throw new Error('Use onboarding-request PAGE orgA|orgB METHOD FAMILY JSON [start].');
		const organization = checked(
			await (await provider()).from('organizations').select('url_slug').eq('id', org(orgKey)).single()
		);
		const input = {
			origin: doctor.origin,
			organizationSegment: organization.url_slug || org(orgKey),
			method,
			family,
			body: JSON.parse(bodyText),
			mode
		};
		note(
			await evaluate(state, pageId, `async () => (${requestOnboarding.toString()})(window, ${JSON.stringify(input)})`)
		);
		return;
	}
	if (['onboarding-request-state', 'onboarding-request-restore'].includes(command)) {
		const pageId = Number(args[0]);
		if (args.length !== 1 || !Number.isInteger(pageId) || pageId < 1) throw new Error('Use an owned page ID.');
		note(
			await evaluate(
				state,
				pageId,
				`() => (${readOnboardingRequests.toString()})(window, ${JSON.stringify(doctor.origin)}, ${command === 'onboarding-request-restore'})`
			)
		);
		return;
	}
	if (command === 'retention') {
		if (args[0] === 'maintenance') {
			note(await readMaintenance({ client: await provider(), fixture, ownedState: await saved() }));
			return;
		}
		if (args[0] === 'settings') {
			const client = await provider();
			note({
				organizations: checked(
					await client
						.from('organizations')
						.select('id,archive_retention_months')
						.in('id', [org('orgA'), org('orgB')])
				)
			});
			return;
		}
		if (args[0] === 'files') {
			note(await readRetentionFiles(await provider(), await saved()));
			return;
		}
		if (
			args[0] !== 'cron' ||
			!['missing', 'wrong', 'run'].includes(args[1]) ||
			(args[2] && !['records', 'onboarding', 'audit', 'setup-links'].includes(args[2]))
		)
			throw new Error(
				'Use retention settings|files|maintenance or retention cron missing|wrong|run [records|onboarding|audit|setup-links].'
			);
		const endpoint = {
			records: '/api/cleanup-archived-records',
			onboarding: '/api/cleanup-expired-onboardings',
			audit: '/api/cleanup-old-data',
			'setup-links': '/api/cleanup-account-setup-links'
		}[args[2] ?? 'records'];
		const headers = {};
		if (args[1] === 'wrong') headers.authorization = 'Bearer synthetic-incorrect-secret';
		if (args[1] === 'run') {
			const credential = await readJSON(path.join(session, 'archive-cleanup.json'));
			headers.authorization = `Bearer ${credential.secret}`;
		}
		const response = await fetch(new URL(endpoint, state.origin), {
			headers,
			redirect: 'manual',
			signal: AbortSignal.timeout(180000)
		});
		const body = await response.text();
		note({ mode: args[1], endpoint, status: response.status, location: response.headers.get('location'), body });
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
			'settings/logs',
			'settings/policies',
			'settings/general',
			'settings/archives',
			'settings/approvals',
			'settings/members',
			'settings/exports',
			'settings/danger'
		];
		if (
			!fixture.actors[role] ||
			![
				...orgDestinations,
				'dashboard',
				'org/new',
				'admin',
				'admin/announcements',
				'admin/feedback',
				'admin/audit',
				'admin/users',
				'admin/organizations',
				'admin/access-requests'
			].includes(destination) ||
			(fixture.actors[role].organization === null && orgDestinations.includes(destination)) ||
			((destination === 'admin' || destination.startsWith('admin/')) &&
				![
					'platformReviewer',
					'platformSupport',
					'platformBilling',
					'platformInactive',
					'viewer',
					'orgOwner',
					'orgAdmin',
					'orgMember',
					'orgSettingsPeer'
				].includes(role))
		)
			throw new Error('Unknown synthetic actor or destination.');
		const targetOrg = fixture.actors[role].organization ?? null;
		const destinationPath =
			destination === 'admin' || destination.startsWith('admin/')
				? `/${destination}`
				: destination === 'dashboard'
					? '/dashboard?show=all'
					: destination === 'org/new'
						? '/org/new'
						: destination === 'home'
							? `/org/${org(targetOrg)}`
							: `/org/${org(targetOrg)}/${destination}`;
		let readyText =
			destination === 'admin/audit'
				? [
						'Audit Log',
						'Access denied',
						'Forbidden',
						'Not authorized',
						"You don't have access",
						"You don't have permission to view this page"
					]
				: destination === 'settings/logs'
					? ['Audit Log', "You don't have permission to view this page"]
					: destination === 'admin/feedback'
						? ['Sort incoming bug reports', 'Access denied', 'Forbidden']
						: destination.startsWith('onboarding')
							? [
									'STEPS',
									'No templates yet.',
									'In processing',
									'No active onboardings',
									'Set up onboarding',
									'Onboarding not configured',
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
											: destination === 'settings/approvals'
												? ['Approval Requests', "You don't have permission to view this page"]
												: destination === 'settings/policies'
													? ['Archive Retention', "You don't have permission to view this page"]
													: destination === 'settings/general'
														? ['Organization Profile', "You don't have permission to view this page"]
														: destination === 'settings/members'
															? ['Access Management', "You don't have permission to view this page"]
															: destination === 'settings/exports'
																? ['Export JSON', "You don't have permission to view this page", 'Access restricted']
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
		if (destination === 'admin') readyText = ['Admin Dashboard', 'Total Users', 'Forbidden', 'Access denied', '403'];
		if (destination === 'admin/announcements') readyText = ['Announcements', 'Forbidden', 'Access denied', '403'];
		if (
			destination.startsWith('admin/') &&
			!['admin/audit', 'admin/feedback', 'admin/announcements'].includes(destination)
		)
			readyText = ['Users', 'Organizations', 'Access Requests', 'Forbidden', 'Access denied', '403'];
		readyText = [...readyText, 'Account Suspended', 'Verify your code'];
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
	if (command === 'platform-content') {
		if (args.length) throw new Error('Platform content readback accepts no external targets.');
		const client = await provider();
		const ownedState = await saved();
		const seedIds = ownedState.seeded
			.filter((item) => item.kind === 'communications' && item.table === 'platform_announcements')
			.flatMap((item) => item.ids);
		const select = 'id,title,message,type,is_active,expires_at,created_by,updated_by,created_at';
		const announcements = checked(
			await selectAllSupabaseRows((from, to) =>
				client
					.from('platform_announcements')
					.select(select)
					.eq('created_by', fixture.actors.platformReviewer.id)
					.order('id')
					.range(from, to)
			)
		);
		const seededAnnouncements = seedIds.length
			? checked(await client.from('platform_announcements').select(select).in('id', seedIds))
			: [];
		note({ announcements, seededAnnouncements });
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
	if (command === 'artifact-deletion') {
		const [orgKey, personnelId, kind, artifactId] = args;
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (
			args.length !== 4 ||
			!uuid.test(personnelId ?? '') ||
			!uuid.test(artifactId ?? '') ||
			!['document', 'counseling'].includes(kind)
		)
			throw new Error('Use artifact-deletion orgA|orgB PERSON_ID document|counseling ARTIFACT_ID.');
		const organizationId = org(orgKey);
		const client = await provider();
		const receipt = checked(
			await client.rpc('personnel_file_artifact_deletion', {
				p_organization_id: organizationId,
				p_personnel_id: personnelId,
				p_kind: kind,
				p_artifact_id: artifactId
			})
		);
		note({ organization: orgKey, personnelId, kind, artifactId, receipt });
		return;
	}
	if (command === 'artifact-files') {
		const [orgKey, personnelId, ...recordedPaths] = args;
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personnelId ?? ''))
			throw new Error('Use a synthetic Personnel UUID.');
		if (recordedPaths.length % 2 !== 0)
			throw new Error('Optional recorded paths use counseling|document FILE_PATH pairs.');
		const organizationId = org(orgKey);
		const families = {
			counseling: {
				table: 'counseling_records',
				bucket: 'counseling-files',
				prefix: `${organizationId}/counseling-records/${personnelId}/`
			},
			document: {
				table: 'personnel_documents',
				bucket: 'personnel-documents',
				prefix: `${organizationId}/personnel/${personnelId}/documents/`
			}
		};
		const files = new Map();
		const rememberPath = (kind, filePath) => {
			const family = families[kind];
			const prefix = family?.prefix;
			const filename = prefix && filePath?.startsWith(prefix) ? filePath.slice(prefix.length) : '';
			if (!prefix || !/^[a-zA-Z0-9._-]+$/.test(filename) || ['.', '..'].includes(filename))
				throw new Error('Artifact file path is outside the exact synthetic Organization/Person file prefix.');
			files.set(`${family.bucket}/${filePath}`, {
				table: family.table,
				bucket: family.bucket,
				path: filePath,
				prefix: prefix.slice(0, -1),
				filename
			});
		};
		for (let index = 0; index < recordedPaths.length; index += 2)
			rememberPath(recordedPaths[index], recordedPaths[index + 1]);
		const client = await provider();
		const tables = await Promise.all(
			Object.entries(families).map(async ([kind, family]) => {
				const rows = checked(
					await selectAllSupabaseRows((from, to) =>
						client
							.from(family.table)
							.select('id,personnel_id,organization_id,file_path,archived_at')
							.eq('organization_id', organizationId)
							.eq('personnel_id', personnelId)
							.order('id')
							.range(from, to)
					)
				);
				for (const row of rows) if (row.file_path !== null) rememberPath(kind, row.file_path);
				return [family.table, rows];
			})
		);
		const observations = [];
		for (const file of files.values()) {
			const bucket = client.storage.from(file.bucket);
			let offset = 0;
			let present = false;
			do {
				const entries = checked(
					await bucket.list(file.prefix, {
						search: file.filename,
						limit: 1000,
						offset,
						sortBy: { column: 'name', order: 'asc' }
					})
				);
				present = entries.some((entry) => entry.name === file.filename && entry.id !== null);
				if (present || entries.length < 1000) break;
				offset += 1000;
			} while (!present);
			const observation = { ...file, present, listingOffset: offset };
			if (present) {
				const blob = checked(await bucket.download(file.path));
				const bytes = Buffer.from(await blob.arrayBuffer());
				observation.size = bytes.length;
				observation.sha256 = createHash('sha256').update(bytes).digest('hex');
			}
			observations.push(observation);
		}
		note({ organization: orgKey, personnelId, tables: Object.fromEntries(tables), files: observations });
		return;
	}
	if (command === 'private-buckets') {
		if (args.length) throw new Error('Use private-buckets without arguments.');
		const client = await provider();
		const buckets = [];
		for (const id of ['personnel-documents', 'counseling-files']) {
			const bucket = checked(await client.storage.getBucket(id));
			buckets.push({
				id: bucket.id,
				public: bucket.public,
				fileSizeLimit: bucket.file_size_limit,
				allowedMimeTypes: bucket.allowed_mime_types
			});
		}
		note({ buckets });
		return;
	}
	if (command === 'roster-files') {
		const [orgKey, rosterId] = args;
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rosterId ?? ''))
			throw new Error('Use a synthetic roster UUID.');
		const { stdout } = await promisify(execFile)(
			'python3',
			[
				path.join(repository, '.agents/skills/verify-trooptotask/helpers/roster-provider.py'),
				'inventory',
				'--worker',
				worker,
				orgKey,
				rosterId
			],
			{ maxBuffer: 1024 * 1024 }
		);
		const inventory = JSON.parse(stdout);
		if (inventory.status !== 'PASS') throw new Error('Owned roster inventory failed.');
		const bucket = (await provider()).storage.from('counseling-files');
		const files = [];
		for (const entry of inventory.objects) {
			const blob = checked(await bucket.download(entry.key));
			const bytes = Buffer.from(await blob.arrayBuffer());
			files.push({
				key: entry.key,
				name: path.basename(entry.key),
				size: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex'),
				referenced: inventory.rows.some((row) => row.signed_file_path === entry.key)
			});
		}
		note({ organization: orgKey, rosterId, ...inventory, files });
		return;
	}
	if (command === 'roster-replace') {
		const [page, orgKey, rosterKey, filename, secondFilename] = args;
		const deleteOnly = args.length === 4 && filename === 'delete';
		const concurrentAction = deleteOnly
			? 'delete'
			: ['remove', 'delete'].includes(secondFilename)
				? secondFilename
				: null;
		const pageId = Number(page);
		const fixtureRoster = ['rosterAlpha', 'rosterMixed', 'rosterUnassigned', 'rosterForeign'].includes(rosterKey);
		if (
			![4, 5].includes(args.length) ||
			!Number.isInteger(pageId) ||
			pageId < 1 ||
			!(fixtureRoster || (deleteOnly && recordedRosterInsertTarget(await saved(), orgKey, rosterKey)))
		)
			throw new Error(
				'Use roster-replace PAGE orgA|orgB FIXTURE_ROSTER_KEY EVIDENCE_PDF [SECOND_PDF|remove|delete], or PAGE orgA|orgB FIXTURE_ROSTER_KEY|RECORDED_INSERT_ID delete.'
			);
		const rosterId = fixtureRoster ? fixture.ids[rosterKey] : rosterKey;
		const client = await provider();
		const rosterRead = client
			.from('sign_in_rosters')
			.select('id,signed_file_path')
			.eq('organization_id', org(orgKey))
			.eq('id', rosterId);
		const roster = checked(await (deleteOnly ? rosterRead.maybeSingle() : rosterRead.single()));
		const uploads = [];
		for (const candidateFilename of deleteOnly
			? []
			: [filename, concurrentAction ? null : secondFilename].filter(Boolean)) {
			const target = await fs.realpath(path.resolve(candidateFilename));
			if (!target.startsWith(evidenceRoot + path.sep) || !target.endsWith('.pdf') || !(await fs.stat(target)).isFile())
				throw new Error('Use a real PDF under the skill evidence directory without a symlink escape.');
			const bytes = await fs.readFile(target);
			if (bytes.length > 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
				throw new Error('Use a synthetic PDF no larger than 1 MiB.');
			uploads.push({
				filename: path.basename(target),
				size: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex'),
				base64: bytes.toString('base64')
			});
		}
		const location = new URL(await evaluate(state, pageId, '() => location.href'));
		if (location.origin !== doctor.origin) throw new Error('Use a normally signed-in page on this owned app.');
		const previous = roster?.signed_file_path
			? await client.storage.from('counseling-files').info(roster.signed_file_path)
			: null;
		const endpoint = `/org/${org(orgKey)}/api/sign-in-rosters/${rosterId}/upload`;
		const response = await evaluate(
			state,
			pageId,
			`async () => {
				if (location.origin !== ${JSON.stringify(doctor.origin)}) throw new Error('Owned app origin changed before roster replacement.');
				const requests = ${JSON.stringify(uploads)}.map(async upload => {
					const bytes = Uint8Array.from(atob(upload.base64), c => c.charCodeAt(0));
					const form = new FormData();
					form.set('file', new File([bytes], upload.filename, { type: 'application/pdf' }));
					const response = await fetch(${JSON.stringify(endpoint)}, { method: 'POST', body: form, redirect: 'error' });
					return { filename: upload.filename, status: response.status, body: await response.text() };
				});
				const action = ${JSON.stringify(concurrentAction)};
				if (action) requests.push((async () => {
					const path = action === 'remove' ? ${JSON.stringify(endpoint)} : ${JSON.stringify(endpoint.slice(0, -7))};
					const body = action === 'remove' ? JSON.stringify({ filePath: ${JSON.stringify(roster?.signed_file_path ?? null)} }) : undefined;
					const response = await fetch(path, { method: 'DELETE', headers: body ? { 'Content-Type': 'application/json' } : {}, body, redirect: 'error' });
					return { action, method: 'DELETE', path, status: response.status, body: await response.text() };
				})());
				return { responses: await Promise.all(requests) };
			}`
		);
		note({
			pageId,
			organization: orgKey,
			rosterId,
			endpoint,
			method: 'POST',
			concurrentAction,
			rosterExisted: !!roster,
			previousPath: roster?.signed_file_path ?? null,
			previousInfo: previous
				? {
						present: !!previous.data,
						error: previous.error
							? {
									name: previous.error.name,
									status: previous.error.status,
									statusCode: previous.error.statusCode,
									message: previous.error.message
								}
							: null
					}
				: null,
			uploads: uploads.map(({ base64: _base64, ...upload }) => upload),
			...response
		});
		return;
	}
	if (command === 'roster-shared-keys') {
		const [action, caseName] = args;
		const client = await provider();
		const ownedState = await saved();
		if (action === 'release' && args.length === 2) {
			note(await releaseSharedKey({ client, fixture, ownedState, caseName }));
			return;
		}
		if (action === 'reuse' && args.length === 2) {
			note(await probeSharedKeyReuse({ client, fixture, ownedState, save, caseName }));
			return;
		}
		if (action !== 'state' || args.length !== 1)
			throw new Error('Use roster-shared-keys state, release CASE or reuse CASE after seed roster-shared-keys.');
		let stdout;
		try {
			({ stdout } = await promisify(execFile)(
				'python3',
				[
					path.join(repository, '.agents/skills/verify-trooptotask/helpers/roster-provider.py'),
					'keys',
					'--worker',
					worker
				],
				{ maxBuffer: 4 * 1024 * 1024 }
			));
		} catch (cause) {
			throw new Error(JSON.parse(cause.stdout || '{}').message ?? 'Owned shared-key readback blocked.');
		}
		const readback = JSON.parse(stdout);
		const files = ownedState.rosterSharedKeys.files;
		const keys = [];
		for (const entry of readback.keys) {
			const { data, error } = await client.storage.from(entry.bucket).download(entry.key);
			const seeded = files.find((file) => file.path === entry.key);
			let bytes = { present: false };
			if (error) {
				if (String(error.statusCode ?? error.status ?? '') !== '404')
					throw new Error('Owned Storage byte read failed rather than proving absence.');
			} else {
				const body = Buffer.from(await data.arrayBuffer());
				const sha256 = createHash('sha256').update(body).digest('hex');
				bytes = { present: true, size: body.length, sha256, matchesSeed: sha256 === seeded.sha256 };
			}
			keys.push({ ...entry, bytes });
		}
		note({
			binding: readback.binding,
			tag: ownedState.rosterSharedKeys.tag,
			cases: ownedState.rosterSharedKeys.cases,
			keys,
			boundary: 'Privileged synthetic readback of recorded keys only; separate from ordinary read authority.'
		});
		return;
	}
	if (command === 'roster-insert') {
		const config = await readJSON(path.join(session, 'provider.json'));
		const signIn = async (actor) => {
			const ordinary = createClient(config.API_URL, config.ANON_KEY, {
				auth: { persistSession: false, autoRefreshToken: false }
			});
			const login = await ordinary.auth.signInWithPassword({ email: actor.email, password: actor.password });
			if (login.error || login.data.user?.id !== actor.id)
				throw new Error('Normal owned actor provider sign-in failed.');
			return ordinary;
		};
		note(
			await insertRosterWithId({
				service: await provider(),
				signIn,
				fixture,
				args,
				tag: randomUUID().slice(0, 8),
				ownedState: await saved(),
				save
			})
		);
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
	if (command === 'dashboard-access') {
		const [role, mode] = args;
		if (
			args.length !== 2 ||
			!['dashboardView', 'dashboardSwitch'].includes(role) ||
			!['alpha', 'no-training', 'restore'].includes(mode)
		)
			throw new Error('Use dashboard-access dashboardView|dashboardSwitch alpha|no-training|restore.');
		const client = await provider();
		const rows = checked(
			await client
				.from('organization_memberships')
				.select('id,capability_overrides,access_scope_kind,access_scope_group_ids')
				.eq('organization_id', org('orgA'))
				.eq('user_id', fixture.actors[role].id)
		);
		if (rows.length !== 1) throw new Error('Expected one owned Dashboard A membership.');
		const { id, ...original } = rows[0];
		const ownedState = await saved();
		ownedState.dashboardAccess ??= [];
		let snapshot = ownedState.dashboardAccess.find((item) => item.id === id);
		if (!snapshot && mode !== 'restore') {
			snapshot = { id, original };
			ownedState.dashboardAccess.push(snapshot);
			await save(ownedState);
		}
		if (mode === 'restore' && !snapshot) throw new Error('No owned Dashboard access change to restore.');
		const changes =
			mode === 'restore'
				? snapshot.original
				: mode === 'alpha'
					? { access_scope_kind: 'groups', access_scope_group_ids: [fixture.ids.groupA] }
					: { capability_overrides: { ...original.capability_overrides, training: 'none' } };
		checked(
			await client.from('organization_memberships').update(changes).eq('organization_id', org('orgA')).eq('id', id)
		);
		if (mode === 'restore') {
			ownedState.dashboardAccess = ownedState.dashboardAccess.filter((item) => item.id !== id);
			await save(ownedState);
		}
		note({ role, mode, membershipId: id, changes });
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
	if (command === 'destruction') {
		if (['overlap-scan', 'overlap-delete'].includes(args[0])) {
			if (args.length !== 1) throw new Error('Overlap controls accept no target or credentials.');
			const client = await provider();
			const ownedState = await saved();
			const config = await readJSON(path.join(session, 'provider.json'));
			const owner = createClient(config.API_URL, config.ANON_KEY, {
				auth: { persistSession: false, autoRefreshToken: false }
			});
			const login = await owner.auth.signInWithPassword({
				email: fixture.actors.orgOwner.email,
				password: fixture.actors.orgOwner.password
			});
			if (login.error || login.data.user?.id !== fixture.actors.orgOwner.id)
				throw new Error('Normal owned owner provider sign-in failed.');
			if (args[0] === 'overlap-scan') {
				if (ownedState.uploadOverlap) throw new Error('Use a fresh worker for another overlap.');
				const prepared = await prepareUploadOverlap(owner, {
					orgId: org('orgA'),
					personId: fixture.ids.personA,
					tag: randomUUID().slice(0, 8)
				});
				ownedState.uploadOverlap = { ...prepared, sessionId: state.id, candidate: doctor.candidate };
				await save(ownedState);
				note(ownedState.uploadOverlap);
				return;
			}
			const prepared = ownedState.uploadOverlap;
			if (
				!prepared ||
				prepared.sessionId !== state.id ||
				prepared.candidate !== doctor.candidate ||
				prepared.orgId !== org('orgA') ||
				prepared.personId !== fixture.ids.personA
			)
				throw new Error('No unchanged owned final scan belongs to this worker.');
			const { row, bytes } = await inspectUploadOverlap(client, prepared);
			const file = {
				bucket: 'personnel-documents',
				path: row.file_path,
				size: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex')
			};
			ownedState.seeded.push({
				kind: 'organization-upload-overlap',
				table: 'personnel_documents',
				organization: 'orgA',
				ids: [row.id],
				files: [file]
			});
			await save(ownedState);

			const deletion = await deleteAfterUploadOverlap(owner, prepared);
			const organizationAfter = checked(await client.from('organizations').select('id,name').eq('id', prepared.orgId));
			const documentAfter = checked(await client.from('personnel_documents').select('*').eq('id', row.id));
			const blob = checked(await client.storage.from(file.bucket).download(file.path));
			const afterBytes = Buffer.from(await blob.arrayBuffer());
			note({
				prepared,
				nativeDocument: row,
				fileBefore: file,
				deletion,
				organizationAfter,
				documentAfter,
				fileAfter: { ...file, size: afterBytes.length, sha256: createHash('sha256').update(afterBytes).digest('hex') },
				boundary: 'Ordinary provider delete after native upload; not Identity or native destruction proof.'
			});
			return;
		}
		if (['fault-on', 'fault-off', 'bytes'].includes(args[0])) {
			let stdout;
			try {
				({ stdout } = await promisify(execFile)(
					'python3',
					[
						path.join(repository, '.agents/skills/verify-trooptotask/helpers/organization-destruction-provider.py'),
						'--worker',
						worker,
						args[0]
					],
					{ maxBuffer: 8 * 1024 * 1024 }
				));
			} catch (cause) {
				let blocked;
				try {
					blocked = JSON.parse(cause.stdout);
				} catch {
					throw cause;
				}
				if (blocked?.status === 'BLOCKED' && typeof blocked.message === 'string') {
					throw new Error(blocked.message);
				}
				throw cause;
			}
			note(JSON.parse(stdout));
			return;
		}
		if (args[0] !== 'files') throw new Error('Use destruction files, bytes, fault-on, or fault-off.');
		const client = await provider();
		const files = (await saved()).seeded.flatMap((item) => item.files ?? []);
		const observations = [];
		for (let start = 0; start < files.length; start += 16) {
			observations.push(
				...(await Promise.all(
					files.slice(start, start + 16).map(async (file) => {
						const { data, error } = await client.storage.from(file.bucket).download(file.path);
						if (error) {
							const status = String(error.statusCode ?? error.status ?? '');
							if (status !== '404') throw new Error('Owned Storage byte read failed rather than proving absence.');
							return { ...file, present: false, status };
						}
						const bytes = Buffer.from(await data.arrayBuffer());
						return {
							...file,
							present: true,
							observedSize: bytes.length,
							observedSha256: createHash('sha256').update(bytes).digest('hex')
						};
					})
				))
			);
		}
		note({ files: observations });
		return;
	}
	if (command === 'seed') {
		const kind = args[0];
		if (
			![
				'duplicate-able',
				'overlap',
				'bulk-501',
				'availability-volume',
				'training-pages',
				'training-print',
				'roster-pages',
				'personnel-lifecycle',
				'personnel-artifact-context',
				'personnel-retention',
				'personnel-retention-1001',
				'personnel-retention-dense',
				'artifact-retention',
				'artifact-retention-1001',
				'maintenance-retention',
				'maintenance-retention-1001',
				'onboarding-legacy',
				'onboarding-start',
				'onboarding-history',
				'onboarding-history-view',
				'onboarding-consumers',
				'onboarding-status',
				'onboarding-matrix',
				'onboarding-long-text',
				'onboarding-retention',
				'onboarding-retention-1001',
				'audit',
				'dashboard',
				'dashboard-currency',
				'dashboard-overflow',
				'platform-admin',
				'organization-pages',
				'communications',
				'organization-destruction',
				'rating-scheme',
				'deletion-sources',
				'account-setup',
				'roster-shared-keys',
				'federal-reset-sentinels'
			].includes(kind)
		)
			throw new Error('Unknown temporary seed.');
		const client = await provider();
		const ownedState = await saved();
		const tag = randomUUID().slice(0, 8);
		if (kind === 'training-print') {
			note(await seedTrainingPrint({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'availability-volume') {
			const volume = buildAvailabilityVolume({
				organizationId: org('orgA'),
				groupIds: [fixture.ids.groupA, fixture.ids.groupB, null],
				statusTypeIds: [fixture.ids.statusLeave, fixture.ids.statusTraining],
				anchorDate: fixture.dates.ui,
				tag
			});
			ownedState.seeded.push(
				{ kind, table: 'personnel', ids: volume.personnel.map((record) => record.id), tag },
				{ kind, table: 'availability_entries', ids: volume.entries.map((record) => record.id), tag }
			);
			await save(ownedState);
			for (let offset = 0; offset < volume.personnel.length; offset += 100)
				checked(await client.from('personnel').insert(volume.personnel.slice(offset, offset + 100)));
			for (let offset = 0; offset < volume.entries.length; offset += 200)
				checked(await client.from('availability_entries').insert(volume.entries.slice(offset, offset + 200)));
			note({ kind, tag, anchor: fixture.dates.ui, ...volume.summary });
			return;
		}
		if (kind === 'roster-shared-keys') {
			note(await seedRosterSharedKeys({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'platform-admin') {
			note(await seedPlatform({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'organization-pages') {
			note(await seedOrganizationPages({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'audit') {
			note(await seedAudit({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'dashboard') {
			note(await seedDashboard({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'dashboard-currency') {
			note(await seedDashboardCurrency({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'dashboard-overflow') {
			note(await seedDashboardOverflow({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'deletion-sources') {
			note(await seedDeletionSources({ client, fixture, tag, ownedState, save }));
			return;
		}
		if (kind === 'account-setup') {
			if (ownedState.accountSetup) throw new Error('Clean the existing account setup seed first.');
			const seed = Object.entries(accountSetupSeed(tag));
			ownedState.accountSetup = { tag, tokens: Object.fromEntries(seed.map(([key, item]) => [key, item.rawToken])) };
			for (const [table, key] of [
				['access_requests', 'request'],
				['account_setup_links', 'link']
			])
				ownedState.seeded.push({ kind, tag, table, organization: null, ids: seed.map(([, item]) => item[key].id) });
			await save(ownedState);
			checked(await client.from('access_requests').insert(seed.map(([, item]) => item.request)));
			checked(await client.from('account_setup_links').insert(seed.map(([, item]) => item.link)));
			note({
				kind,
				tag,
				classes: Object.fromEntries(
					seed.map(([key, { request, link }]) => [
						key,
						{
							email: request.email,
							accessRequestStatus: request.status,
							link: Object.fromEntries(Object.entries(link).filter(([field]) => field !== 'token_hash'))
						}
					])
				),
				boundary: 'Privileged synthetic setup links; raw tokens stay in private worker state.'
			});
			return;
		}
		if (kind === 'organization-destruction') {
			if (ownedState.seeded.some((item) => item.kind === kind))
				throw new Error('Restore and clean the existing destruction seed first.');
			const objects = [];
			const add = (bucket, filePath, classification) => {
				const bytes = Buffer.from('Synthetic Organization destruction ' + tag + ' ' + classification + ' ' + filePath);
				objects.push({
					bucket,
					path: filePath,
					classification,
					size: bytes.length,
					sha256: createHash('sha256').update(bytes).digest('hex'),
					bytes
				});
			};
			for (let n = 0; n < 1002; n++)
				add(
					'personnel-documents',
					`${org('orgA')}/destruction-${tag}/page/${String(n).padStart(4, '0')}.pdf`,
					'target-orphan'
				);
			const lowerId = org('orgA').toLowerCase();
			const upperId = lowerId.toUpperCase();
			const mixedId = lowerId.replace(/[a-f]/, (letter) => letter.toUpperCase());
			if (mixedId === lowerId || mixedId === upperId) throw new Error('Fixture needs distinct UUID path casing.');
			const sharedSuffix = `/destruction-${tag}/nested/orphan.pdf`;
			add('counseling-files', lowerId + sharedSuffix, 'target-lowercase');
			add('counseling-files', upperId + sharedSuffix, 'target-uppercase');
			add('counseling-files', mixedId + sharedSuffix, 'target-mixed');
			add('counseling-files', `${org('orgA')}/destruction-${tag}-root.pdf`, 'target-root');
			for (const bucket of ['counseling-files', 'personnel-documents']) {
				add(bucket, `${org('orgB')}/destruction-${tag}/foreign.pdf`, 'foreign');
				// Invalid namespace lookalikes are historical SQL fixtures; runtime writes now require a canonical Organization.
			}
			const source = objects.find((file) => file.classification === 'target-lowercase');
			const prefixRoot = {
				...source,
				path: lowerId + '/',
				classification: 'target-prefix-root',
				copyFrom: source.path
			};
			// SDK upload trims trailing slashes; copy preserves this valid raw key.
			// Ledger the destination before any effect and copy only after its source exists.
			objects.push(prefixRoot);
			for (const file of objects) file.uploadId = randomUUID();
			const files = objects.map(({ bytes: _bytes, ...file }) => file);
			ownedState.seeded.push({ kind, tag, table: 'organizations', organization: 'orgA', ids: [], files });
			await save(ownedState);
			const uploads = objects.filter((file) => !file.copyFrom);
			for (let start = 0; start < uploads.length; start += 16)
				await Promise.all(
					uploads.slice(start, start + 16).map((file) => registeredFixtureFileWrite(client, fixture, file))
				);
			await registeredFixtureFileWrite(client, fixture, prefixRoot);
			note({ kind, tag, files, setup: 'Synthetic Storage API upload/copy; no application acceptance claim.' });
			return;
		}
		if (kind === 'personnel-artifact-context') {
			const actor = fixture.actors.personnelContext;
			if (!actor || actor.organization !== 'orgA') throw new Error('The Personnel context actor is unavailable.');
			const archivedAt = '2026-08-01T12:00:00.000Z';
			const sharedSlug = `map-artifact-context-${tag}`;
			const membership = {
				id: randomUUID(),
				organization_id: org('orgB'),
				user_id: actor.id,
				role: 'member',
				member_preset: 'viewer',
				capability_overrides: {
					personnel: 'configure',
					calendar: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				access_scope_kind: 'organization',
				access_scope_group_ids: []
			};
			const parents = ['orgA', 'orgB'].map((organization) => ({
				id: randomUUID(),
				organization_id: org(organization),
				group_id: fixture.ids[organization === 'orgA' ? 'groupA' : 'groupForeign'],
				first_name: 'Synthetic',
				last_name: `MapContext${organization === 'orgA' ? 'Alpha' : 'Foreign'}${tag}`,
				rank: 'SPC',
				mos: '68W',
				clinic_role: 'Medic',
				slug: sharedSlug,
				archived_at: null
			}));
			const rows = {
				leader_notes: [],
				personnel_follow_ups: [],
				counseling_records: [],
				personnel_documents: []
			};
			const objects = [];
			for (const parent of parents) {
				const organization = parent.organization_id === org('orgA') ? 'orgA' : 'orgB';
				for (const classification of ['active', 'archived']) {
					const base = {
						organization_id: parent.organization_id,
						personnel_id: parent.id,
						archived_at: classification === 'archived' ? archivedAt : null
					};
					const label = `${organization} ${classification} context ${tag}`;
					rows.leader_notes.push({
						...base,
						id: randomUUID(),
						author: actor.id,
						text: `${label} note`
					});
					rows.personnel_follow_ups.push({
						...base,
						id: randomUUID(),
						title: `${label} follow-up`,
						notes: `${label} follow-up details`,
						status: classification === 'archived' ? 'archived' : 'open',
						created_by: actor.id,
						completed_at: base.archived_at
					});
					for (const table of ['counseling_records', 'personnel_documents']) {
						const id = randomUUID();
						const title = `${label} ${table === 'personnel_documents' ? 'document' : 'counseling'}`;
						const pdf = new jsPDF();
						pdf.text(`Synthetic ${title} ${id}`, 10, 20);
						const bytes = Buffer.from(pdf.output('arraybuffer'));
						const filePath =
							table === 'personnel_documents'
								? `${parent.organization_id}/personnel/${parent.id}/documents/${id}-synthetic.pdf`
								: `${parent.organization_id}/counseling-records/${parent.id}/${id}-synthetic.pdf`;
						const record = { ...base, id, title, file_path: filePath, uploaded_by: actor.id };
						rows[table].push(
							table === 'personnel_documents'
								? { ...record, file_size_bytes: bytes.length, content_type: 'application/pdf' }
								: {
										...record,
										date_conducted: classification === 'archived' ? '2026-07-15' : fixture.dates.ui,
										subject: title,
										summary: `${label} counseling summary`,
										notes: `${label} counseling summary`,
										status: 'completed'
									}
						);
						objects.push({
							bucket: table === 'personnel_documents' ? 'personnel-documents' : 'counseling-files',
							path: filePath,
							organization,
							organizationId: parent.organization_id,
							personnelId: parent.id,
							rowId: id,
							classification,
							size: bytes.length,
							sha256: createHash('sha256').update(bytes).digest('hex'),
							bytes
						});
					}
				}
			}
			for (const file of objects) file.uploadId = randomUUID();
			const files = objects.map(({ bytes: _bytes, ...file }) => file);
			const batches = [
				['organization_memberships', 'orgB', [membership]],
				...['orgA', 'orgB'].map((organization) => [
					'personnel',
					organization,
					parents.filter((parent) => parent.organization_id === org(organization))
				]),
				...Object.entries(rows).flatMap(([table, records]) =>
					['orgA', 'orgB'].map((organization) => [
						table,
						organization,
						records.filter((record) => record.organization_id === org(organization))
					])
				)
			];
			// Save every row and actual path before effects; attach files once so
			// reverse cleanup deletes children and parents before the B membership.
			for (const [table, organization, records] of batches)
				ownedState.seeded.push({
					kind,
					tag,
					table,
					organization,
					ids: records.map((record) => record.id),
					...(table === 'personnel' && organization === 'orgA' ? { files } : {})
				});
			await save(ownedState);
			for (const [table, , records] of batches) checked(await client.from(table).insert(records));
			for (const file of objects) await registeredFixtureFileWrite(client, fixture, file);
			note({
				kind,
				tag,
				actor: { role: 'personnelContext', id: actor.id },
				membership,
				sharedSlug,
				archivedAt,
				parents,
				rows,
				files,
				fileSetup: 'Actual synthetic PDF uploads; provider readback and native interactions remain unverified.'
			});
			return;
		}
		if (kind.startsWith('maintenance-retention')) {
			note(await seedMaintenance({ client, fixture, kind, tag, ownedState, save }));
			return;
		}
		if (kind.startsWith('artifact-retention')) {
			note(await seedArtifactRetention({ client, fixture, kind, tag, ownedState, save }));
			return;
		}
		if (kind.startsWith('personnel-retention')) {
			note(await seedPersonnelRetention({ client, fixture, kind, tag, ownedState, save }));
			return;
		}
		if (kind.startsWith('onboarding-')) {
			note(await seedOnboarding({ client, fixture, kind, tag, ownedState, save }));
			return;
		}
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
						file_path: `${base.organization_id}/personnel/${ids.person}/documents/synthetic-${status}.pdf`,
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
		if (kind === 'federal-reset-sentinels') {
			const rows = {
				orgA: { id: randomUUID(), date: '2019-07-04', name: `Map stale federal ${tag}` },
				orgB: { id: randomUUID(), date: '2026-07-03', name: `Map foreign federal ${tag}` }
			};
			for (const [organization, row] of Object.entries(rows))
				ownedState.seeded.push({ kind, table: 'special_days', organization, ids: [row.id], tag });
			await save(ownedState);
			for (const [organization, row] of Object.entries(rows))
				checked(
					await client
						.from('special_days')
						.insert({ ...row, organization_id: org(organization), type: 'federal-holiday' })
				);
			note({ kind, tag, rows });
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
		} else if (kind === 'roster-pages') {
			table = 'sign_in_rosters';
			records = Array.from({ length: 1001 }, (_, index) => ({
				id: randomUUID(),
				organization_id: org('orgA'),
				title: `MapRoster${tag}${String(index).padStart(4, '0')}`,
				roster_date: null,
				blank_date: true,
				separate_by_group: false,
				sort_by: 'rank',
				personnel_ids: [fixture.ids.personA],
				scope_group_ids: [fixture.ids.groupA],
				personnel_snapshot: [
					{
						id: fixture.ids.personA,
						rank: 'VFY-ACTIVE-A',
						lastName: 'Historical',
						firstName: 'Synthetic',
						group: 'Former Alpha',
						retainedMarker: index
					}
				],
				filter_config: { ranks: ['VFY-ACTIVE-A'], groups: ['Former Alpha'], retainedMarker: tag },
				signed_file_path: null,
				created_by: fixture.actors.rosterManager.id,
				created_at: '2026-01-02T03:04:05.123456Z'
			}));
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
		if (kind === 'roster-pages') {
			for (let offset = 0; offset < records.length; offset += 100)
				checked(await client.from(table).insert(records.slice(offset, offset + 100)));
		} else checked(await client.from(table).insert(records));
		note({ kind, tag, count: records.length, firstId: records[0].id });
		return;
	}
	if (command === 'clean-seeds') {
		await deletionReviewFailure('restore');
		const client = await provider();
		const ownedState = await saved();
		for (const snapshot of ownedState.dashboardAccess ?? [])
			checked(
				await client
					.from('organization_memberships')
					.update(snapshot.original)
					.eq('organization_id', org('orgA'))
					.eq('id', snapshot.id)
			);
		ownedState.dashboardAccess = [];
		await save(ownedState);
		let platformCleanup;
		let platformError;
		try {
			platformCleanup = await cleanPlatform({ client, fixture, ownedState, save });
		} catch (error) {
			platformError = error;
		}
		await cleanTrainingPrint({ client, fixture, ownedState, save });
		await cleanRosterInserts({ service: client, fixture, ownedState, save });
		const sharedKeyCleanup = await cleanRosterSharedKeys({ client, fixture, ownedState, save });
		for (const item of [...ownedState.seeded].reverse()) {
			for (let offset = 0; offset < item.ids.length; offset += 100) {
				const ids = item.ids.slice(offset, offset + 100);
				if (item.kind === 'deletion-sources' || (item.kind === 'personnel-lifecycle' && item.table === 'personnel')) {
					let requests = client
						.from('deletion_requests')
						.delete()
						.eq('organization_id', org(item.organization ?? 'orgA'))
						.in('resource_id', ids);
					if (item.kind === 'personnel-lifecycle') requests = requests.eq('resource_type', 'personnel');
					checked(await requests);
				}
				if (item.kind === 'bulk-501' || (item.kind === 'availability-volume' && item.table === 'personnel'))
					checked(
						await client
							.from('availability_entries')
							.delete()
							.eq('organization_id', org('orgA'))
							.in('personnel_id', ids)
					);
				let query = client.from(item.table).delete().in('id', ids);
				if (
					item.kind !== 'organization-pages' &&
					!(
						(item.kind.startsWith('maintenance-retention') || item.kind === 'account-setup') &&
						['access_requests', 'account_setup_links'].includes(item.table)
					) &&
					(item.kind !== 'communications' || item.table !== 'platform_announcements')
				)
					query = query.eq(
						item.table === 'audit_logs' ? 'org_id' : 'organization_id',
						org(item.organization ?? 'orgA')
					);
				checked(await query);
			}
			for (const bucket of ['personnel-documents', 'counseling-files']) {
				const paths = (item.files ?? []).filter((file) => file.bucket === bucket).map((file) => file.path);
				for (let start = 0; start < paths.length; start += 1000)
					checked(await client.storage.from(bucket).remove(paths.slice(start, start + 1000)));
			}
		}
		ownedState.seeded = [];
		delete ownedState.accountSetup;
		await save(ownedState);
		await clearArtifactHttpCache({ session, sessionId: state.id });
		if (platformError) throw platformError;
		note({ cleaned: true, artifactHttpSessionsCleared: true, platformCleanup, sharedKeyCleanup });
		return;
	}
	if (command === 'network') {
		const [action, page, family, ordinalText = '1'] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1) throw new Error('Use a page ID from the owned browser.');
		if (
			[
				'arm-fail',
				'arm-error',
				'arm-fail-400',
				'arm-hold',
				'arm-hold-fail',
				'arm-hold-dispatch',
				'arm-reject',
				'arm-observe',
				'arm-drop',
				'arm-load-error'
			].includes(action)
		) {
			const platformForm = platformFormNetworkTarget(family, fixture, (await saved()).platform);
			const shellPart = {
				'shell-notification-count': 'notification-count',
				'shell-organization-switcher': 'organization-switcher'
			}[family];
			const formActions = {
				'settings/general/updateName': 'error',
				'settings/general/updateSlug': 'slugError',
				'settings/general/clearSlug': 'slugError',
				'settings/danger/deleteOrganization': 'deleteError',
				'settings/members/updateMemberAccess': 'accessError',
				'settings/members/invite': 'inviteError',
				'settings/members/resendInvite': 'inviteError',
				'settings/members/revokeInvite': 'inviteError',
				'settings/members/removeMember': 'memberError',
				'settings/danger/transferOwnership': 'transferError',
				'settings/ranks/saveRank': 'rankError',
				'settings/ranks/retireRank': 'rankError',
				'settings/ranks/reactivateRank': 'rankError',
				'settings/ranks/bulkRankState': 'rankError',
				'settings/ranks/deleteRank': 'rankError',
				'settings/ranks/addServicePack': 'rankError'
			};
			// Account-level forms outside an Organization: [path, action search, failure field].
			const accountForm = {
				'dashboard/acceptInvitation': ['/dashboard', '?/acceptInvitation', 'error'],
				'dashboard/declineInvitation': ['/dashboard', '?/declineInvitation', 'error'],
				'org/new': ['/org/new', '', 'error']
			}[family];
			const settingsPage =
				/^settings-page\/(general|members|policies|approvals|logs|exports|danger)$/.exec(family)?.[1] ?? null;
			if (
				![
					'audit-page',
					'dashboard-page',
					'user-preferences',
					'shell-notification-count',
					'shell-organization-switcher',
					'admin-suspend',
					'admin-search',
					'admin-transfer',
					'notifications',
					'organization/settings',
					'rating-scheme',
					'feedback',
					'announcements/dismiss',
					'personnel',
					'groups',
					'pinned-groups',
					'personnel/batch',
					'personnel/merge',
					'personnel/archive-batch',
					'personnel/permanent',
					'calendar-range',
					'availability',
					'availability/batch',
					'daily-assignments',
					'daily-assignments/batch',
					'status-types',
					'assignment-types',
					'assignment-types/lanes',
					'status-types/order',
					'ict-tasks/order',
					'ict-tasks/batch',
					'calendar-reports/status-days',
					'special-days',
					'sign-in-rosters',
					'training-types',
					'training-views',
					'onboarding',
					'onboarding-steps',
					'onboarding-resync',
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
				!Object.hasOwn(formActions, family) &&
				!accountForm &&
				!settingsPage &&
				!platformForm &&
				!/^onboarding-templates\/[0-9a-f-]{36}\/duplicate$/.test(family) &&
				!/^sign-in-rosters\/[0-9a-f-]{36}\/upload$/.test(family) &&
				!/^personnel\/[0-9a-f-]{36}\/export$/.test(family) &&
				!/^personnel\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/extended-info$/.test(family) &&
				!/^personnel\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:leader-notes|follow-ups|counseling-records)(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(
					family
				) &&
				!/^personnel\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/documents(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/download)?)?$/.test(
					family
				)
			)
				throw new Error('Unsupported request family.');
			const ordinal = Number(ordinalText);
			if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error('Ordinal must be a positive integer.');
			const formAction = Object.hasOwn(formActions, family) ? family.split('/').at(-1) : null;
			let organizationSegment = org('orgA');
			if (
				formAction ||
				settingsPage ||
				['organization/settings', 'audit-page', 'dashboard-page', 'deletion-requests/review'].includes(family) ||
				shellPart
			) {
				const organization = checked(
					await (await provider()).from('organizations').select('url_slug').eq('id', org('orgA')).single()
				);
				organizationSegment = organization.url_slug || organizationSegment;
			}
			let suffix =
				family === 'dashboard-page'
					? `/org/${organizationSegment}/__data.json`
					: family === 'audit-page' || settingsPage
						? `/org/${organizationSegment}/settings/${settingsPage ?? 'logs'}/__data.json`
						: formAction
							? `/org/${organizationSegment}/${family.slice(0, family.lastIndexOf('/'))}`
							: ['feedback', 'announcements/dismiss'].includes(family)
								? `/api/${family}`
								: `/org/${organizationSegment}/api/${family}`;
			if (family === 'admin-suspend') suffix = '/admin/api/suspend';
			if (family === 'admin-search') suffix = '/admin/api/search';
			if (family === 'admin-transfer') {
				const seed = (await saved()).platform;
				if (!seed) throw new Error('Seed platform-admin first.');
				suffix = `/admin/organizations/${seed.organization.id}`;
			}
			if (platformForm) suffix = platformForm.suffix;
			if (accountForm) suffix = accountForm[0];
			if (shellPart) suffix = `/org/${organizationSegment}/api/app-shell-chrome`;
			if (
				action === 'arm-hold-fail' &&
				![
					'organization/settings',
					'deletion-requests/review',
					'personnel/archive-batch',
					'user-preferences',
					'personnel',
					'pinned-groups',
					'daily-assignments',
					'daily-assignments/batch',
					'status-types',
					'ict-tasks/batch',
					'ict-tasks/order'
				].includes(family) &&
				!platformForm
			)
				throw new Error('Delayed synthetic failure is not supported for this request family.');
			if (
				action === 'arm-hold-dispatch' &&
				![
					'availability',
					'availability/batch',
					'daily-assignments',
					'daily-assignments/batch',
					'special-days'
				].includes(family)
			)
				throw new Error('A held dispatch is supported only for Calendar mutation families.');
			if (
				(/^admin-[a-z-]+-read$/.test(family) || shellPart) &&
				!['arm-fail', 'arm-hold', 'arm-observe', ...(shellPart ? [] : ['arm-load-error'])].includes(action)
			)
				throw new Error('Platform read controls support failure, hold and observation only.');
			if (action === 'arm-load-error' && !/^admin-[a-z-]+-read$/.test(family))
				throw new Error('A page server-load error is supported only for platform page-data reads.');
			if (
				action === 'arm-reject' &&
				!['deletion-requests/review', 'personnel/archive-batch'].includes(family) &&
				!platformForm?.failureField
			)
				throw new Error('Synthetic transport rejection requires a documented mutation family.');
			if (action === 'arm-error' && !formAction && !accountForm)
				throw new Error('Unexpected-error results are supported only for form action families.');
			if (action === 'arm-fail-400' && !platformForm?.failureField)
				throw new Error('A rejected form result is supported only for platform form actions.');
			if (
				action === 'arm-drop' &&
				![
					'admin-suspend',
					'admin-transfer',
					'availability',
					'ict-tasks/batch',
					'personnel-ict-completions/batch'
				].includes(family)
			)
				throw new Error('Lost-response proof requires a documented mutation family.');
			const mode =
				action === 'arm-hold-fail'
					? 'hold-fail'
					: action === 'arm-fail' || action === 'arm-fail-400'
						? 'fail'
						: action === 'arm-error'
							? 'error'
							: action === 'arm-hold'
								? 'hold'
								: action === 'arm-reject'
									? 'reject'
									: action === 'arm-drop'
										? 'drop-response'
										: action === 'arm-load-error'
											? 'load-error'
											: action === 'arm-hold-dispatch'
												? 'hold-dispatch'
												: 'observe';
			const search =
				(shellPart ? `?part=${shellPart}` : platformForm?.search) ??
				accountForm?.[1] ??
				(family === 'admin-transfer' ? '?/transferOwnership' : formAction ? `?/${formAction}` : null);
			const failureField =
				platformForm?.failureField ??
				accountForm?.[2] ??
				(family === 'admin-transfer' ? 'error' : formAction ? formActions[family] : null);
			const requestTarget = platformForm?.requestTarget ?? null;
			const heldPersonnelFailure = family === 'personnel' && action === 'arm-hold-fail';
			const sameOrigin =
				heldPersonnelFailure ||
				(action === 'arm-drop' && ['ict-tasks/batch', 'personnel-ict-completions/batch'].includes(family)) ||
				['user-preferences', 'groups', 'pinned-groups', 'assignment-types', 'ict-tasks/order'].includes(family) ||
				!!shellPart ||
				(platformForm?.sameOrigin ?? false);
			const requestMethod =
				family === 'ict-tasks/order'
					? 'POST'
					: action === 'arm-drop' && family === 'availability'
						? 'ANY'
						: heldPersonnelFailure || family === 'assignment-types/lanes' || family === 'status-types/order'
							? 'PUT'
							: family === 'user-preferences'
								? 'PATCH'
								: shellPart
									? 'GET'
									: null;
			const install = `(${installNetworkControl.toString()})(window, ${JSON.stringify({ mode, ordinal, suffix, search, failureField, failureStatus: action === 'arm-fail-400' ? 400 : 503, requestTarget, sameOrigin, requestMethod })})`;
			// Onboarding's HTTP adapter captures fetch at creation, so install before page code.
			if (family.startsWith('onboarding-') || shellPart) {
				const armed = await evaluate(state, pageId, '() => !!window.__mapNetwork');
				if (armed) throw new Error('Restore the existing map network control first');
				await tool(state, 'navigate_page', { pageId, type: 'reload', initScript: install });
			}
			const result = await evaluate(
				state,
				pageId,
				family.startsWith('onboarding-') || shellPart
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
	if (command === 'busy') {
		const [action, page] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1) throw new Error('Use a page ID from the owned browser.');
		if (!['arm', 'state', 'restore'].includes(action)) throw new Error('Use busy arm|state|restore PAGE.');
		const source =
			action === 'arm'
				? `() => (${installBusyControl.toString()})(window)`
				: action === 'state'
					? '() => ({ armed: !!window.__mapBusy, entries: window.__mapBusy?.entries ?? [] })'
					: '() => { const c = window.__mapBusy; if (!c) return { restored: false }; c.observer.disconnect(); delete window.__mapBusy; return { restored: true }; }';
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
		if (action === 'request') {
			const [, , orgKey, format] = args;
			if (!['json', 'excel'].includes(format) || args.length !== 4)
				throw new Error('Use export request PAGE orgA|orgB json|excel.');
			const endpoint = `/org/${org(orgKey)}/api/${format === 'json' ? 'export' : 'export-excel'}`;
			// Separate ordinary HTTP proof through the signed-in synthetic page, never a native download claim.
			note(
				await evaluate(
					state,
					pageId,
					`async () => {
					if (location.origin !== ${JSON.stringify(doctor.origin)}) throw new Error('Use an owned app page');
					const response = await fetch(${JSON.stringify(endpoint)}, { method: 'POST' });
					const contentType = response.headers.get('Content-Type');
					const body = response.ok ? null : await response.text();
					return { request: { method: 'POST', path: ${JSON.stringify(endpoint)} },
						status: response.status, body,
						contentType, contentDisposition: response.headers.get('Content-Disposition') };
				}`
				)
			);
			return;
		}
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
	if (command === 'style-probe') {
		const [page, filename, ...selectors] = args;
		const pageId = Number(page);
		if (!Number.isInteger(pageId) || pageId < 1 || !filename)
			throw new Error('Use style-probe PAGE FILE.json [SELECTOR ...].');
		const target = path.resolve(filename);
		if (!target.startsWith(evidenceRoot + path.sep) || !target.endsWith('.json'))
			throw new Error('Probe path must be a new .json under the skill evidence directory.');
		const read = await evaluate(
			state,
			pageId,
			`() => {
				if (location.origin !== ${JSON.stringify(doctor.origin)}) throw new Error('Use an owned app page');
				return (${readStyleProbe.toString()})(window, ${JSON.stringify(resolveStyleSelectors(selectors))}, ${JSON.stringify(styleProperties)}, 200);
			}`
		);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, JSON.stringify(read, null, '\t') + '\n', { flag: 'wx' });
		note({
			saved: target,
			url: read.url,
			viewport: read.viewport,
			theme: read.theme,
			matched: read.selectors.filter((entry) => entry.count).map((entry) => `${entry.selector} x${entry.count}`)
		});
		return;
	}
	if (command === 'style-diff') {
		const [beforeFile, afterFile] = args.map((file) => path.resolve(file ?? ''));
		for (const file of [beforeFile, afterFile])
			if (!file.startsWith(evidenceRoot + path.sep) || !file.endsWith('.json'))
				throw new Error('Use style-diff BEFORE.json AFTER.json under the skill evidence directory.');
		const differences = diffStyleProbes(
			JSON.parse(await fs.readFile(beforeFile, 'utf8')),
			JSON.parse(await fs.readFile(afterFile, 'utf8'))
		);
		note({ differences: differences.length, details: differences });
		return;
	}
	if (command === 'toolbar-sweep') {
		const { pageId, label, runName, expectIds, pinnedIds, search, moreAlways, from, to, step, height, recordName } =
			parseSweepArguments(args);
		const runDir = path.resolve(runName);
		if (!(await isUnderEvidence(runDir, evidenceRoot)))
			throw new Error('RUN_DIR must be a directory under the skill evidence directory.');
		if (recordName && !doctor.recording?.available)
			throw new Error(
				doctor.recording?.message ?? 'This worker reports no recording prerequisite; run restart on this checkout.'
			);
		const traceFile = path.join(runDir, 'toolbar-sweep.json');
		const videoFile = recordName ? path.join(runDir, `${recordName}.webm`) : undefined;
		for (const file of [traceFile, videoFile].filter(Boolean))
			if (
				await fs.lstat(file).then(
					() => true,
					() => false
				)
			)
				throw new Error(`${file} already exists; use a new RUN_DIR or name.`);
		await fs.mkdir(runDir, { recursive: true });
		const theme = await evaluate(state, pageId, `() => document.documentElement.dataset.theme ?? null`);
		const recorded = async (name, args, expected) => {
			const result = await tool(state, name, args);
			if (recordingTransition(name, result) !== expected)
				throw new Error(`${name} did not confirm: ${text(result).slice(0, 300)}`);
		};
		const driven = {
			resize: (width, tall) => tool(state, 'resize_page', { pageId, width, height: tall }),
			read: () => evaluate(state, pageId, toolbarReadSource(label, doctor.origin)),
			startRecording: (filePath) => recorded('screencast_start', { pageId, filePath }, 'started'),
			stopRecording: () => recorded('screencast_stop', { pageId }, 'stopped')
		};
		const result = await runSweep({
			page: driven,
			expect: expectIds,
			pinned: pinnedIds,
			search,
			moreAlways,
			from,
			to,
			step,
			height,
			recording: videoFile,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			progress: (message) => process.stderr.write(`toolbar-sweep ${message}\n`),
			write: async (trace) =>
				fs.writeFile(
					traceFile,
					JSON.stringify(
						{
							label,
							theme,
							candidate: doctor.candidate,
							origin: doctor.origin,
							browser: doctor.browser?.version,
							...trace
						},
						null,
						'\t'
					) + '\n',
					{ flag: 'wx' }
				)
		});
		const { verdict } = result;
		note({
			saved: traceFile,
			recording: result.recording,
			ok: verdict.ok,
			steps: { down: result.down.length, up: result.up.length },
			failureCount: verdict.failures.length,
			failures: verdict.failures.slice(0, 20),
			foldedAt: verdict.foldedAt,
			restoredAt: verdict.restoredAt,
			error: result.error
		});
		if (!verdict.ok) process.exitCode = 1;
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
		'Use fixture, actor, rows, access-request, auth-link, setup-link, mail, mail-link, fault, mfa-code, session-age, session-count, admission-probe, password, password-commit, settings-request, deletion-request, personnel-archive-batch, deletion-review-failure, audit-training-update, onboarding-request, onboarding-request-state, onboarding-request-restore, artifact-http, artifact-files, artifact-deletion, private-buckets, roster-files, roster-replace, roster-insert, roster-shared-keys, signed-download, calendar-grant, dashboard-access, server-source, seed, clean-seeds, retention, network, busy, export, print, style-probe, style-diff, toolbar-sweep, or workbook.'
	);
}

main().catch((error) => {
	process.stderr.write(`Map control blocked: ${error.message}\n`);
	process.exitCode = 2;
});
