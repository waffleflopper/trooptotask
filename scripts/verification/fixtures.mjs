import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readJSON, writeJSON, Blocked, environment } from './core.mjs';
import path from 'node:path';

export function checked(result) {
	if (result.error)
		throw new Blocked(
			'FIXTURE_PROVIDER',
			`Synthetic provider operation failed (${result.error.code ?? 'unknown'}): ${result.error.message}. Check disposable provider health.`
		);
	return result.data;
}
export async function provider(session) {
	await environment('status', session);
	const config = await readJSON(path.join(session, 'provider.json'));
	const url = new URL(config.API_URL);
	if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
		throw new Blocked('PROVIDER_TARGET', 'Synthetic provider must be owned loopback HTTP.');
	return createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
export async function seed(session) {
	const service = await provider(session);
	const ids = Object.fromEntries(
		[
			'orgA',
			'orgB',
			'groupA',
			'groupB',
			'groupForeign',
			'personA',
			'personB',
			'personUnassigned',
			'personForeign',
			'statusLeave',
			'statusTraining',
			'statusDelete',
			'statusForeign',
			'typePersonnel',
			'typeGroup',
			'typeDelete',
			'typeArchived',
			'typeForeign',
			'availabilityHistorical',
			'availabilityAlpha',
			'availabilityBravo',
			'availabilityCurrent',
			'availabilityUnassigned',
			'availabilityForeign',
			'availabilityDelete',
			'assignmentPersonnel',
			'assignmentGroup',
			'assignmentDelete',
			'assignmentArchived',
			'assignmentForeign',
			'closureA',
			'closureB',
			'holidayCustom'
		].map((key) => [key, randomUUID()])
	);
	const password = `Synthetic-${randomUUID()}!9`;
	const actors = {};
	const calendarActors = {
		calendarView: { organization: 'orgA', calendar: 'view', scope: 'organization' },
		calendarOperate: { organization: 'orgA', calendar: 'operate', scope: 'organization' },
		calendarConfigure: { organization: 'orgA', calendar: 'configure', scope: 'organization' },
		calendarLane: { organization: 'orgA', calendar: 'operate', scope: 'organization', personnel: 'none' },
		calendarScoped: { organization: 'orgA', calendar: 'operate', scope: 'groups', groups: [ids.groupA] },
		calendarEmpty: { organization: 'orgA', calendar: 'operate', scope: 'groups', groups: [] },
		calendarScopedConfig: { organization: 'orgA', calendar: 'configure', scope: 'groups', groups: [ids.groupA] },
		calendarNotificationAdmin: { organization: 'orgA', calendar: 'none', scope: 'organization', role: 'admin' },
		calendarSwitch: { organization: 'orgA', calendar: 'configure', scope: 'organization' },
		calendarForeign: { organization: 'orgB', calendar: 'configure', scope: 'organization' }
	};
	for (const role of ['manager', 'viewer', 'scoped', 'foreign', ...Object.keys(calendarActors)]) {
		const email = `${role}-${randomUUID()}@example.test`;
		const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
		actors[role] = { email, password, id: user.id };
	}
	checked(
		await service.from('organizations').insert([
			{ id: ids.orgA, name: 'Verification Organization A', created_by: actors.manager.id },
			{ id: ids.orgB, name: 'Verification Organization B', created_by: actors.foreign.id }
		])
	);
	checked(
		await service.from('groups').insert([
			{ id: ids.groupA, organization_id: ids.orgA, name: 'Alpha' },
			{ id: ids.groupB, organization_id: ids.orgA, name: 'Bravo' },
			{ id: ids.groupForeign, organization_id: ids.orgB, name: 'Foreign' }
		])
	);
	for (const [role, actor] of Object.entries(actors)) {
		const calendar = calendarActors[role];
		checked(
			await service.from('organization_memberships').insert({
				organization_id: calendar ? ids[calendar.organization] : role === 'foreign' ? ids.orgB : ids.orgA,
				user_id: actor.id,
				role: calendar?.role ?? 'member',
				member_preset: 'viewer',
				capability_overrides: {
					personnel: calendar ? (calendar.personnel ?? 'view') : role === 'manager' ? 'configure' : 'view',
					calendar: calendar?.calendar ?? 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				access_scope_kind: calendar?.scope ?? (role === 'scoped' ? 'groups' : 'organization'),
				access_scope_group_ids: calendar?.groups ?? (role === 'scoped' ? [ids.groupA] : [])
			})
		);
	}
	checked(
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.calendarSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'none',
				calendar: 'view',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		})
	);
	checked(
		await service.from('personnel').insert(
			[
				['personA', ids.orgA, ids.groupA, 'Able'],
				['personB', ids.orgA, ids.groupB, 'Baker'],
				['personUnassigned', ids.orgA, null, 'Unassigned'],
				['personForeign', ids.orgB, ids.groupForeign, 'Foreign']
			].map(([key, org, group, name]) => ({
				id: ids[key],
				organization_id: org,
				group_id: group,
				first_name: 'Synthetic',
				last_name: name,
				rank: 'SPC',
				clinic_role: '',
				slug: `verify-${name.toLowerCase()}`
			}))
		)
	);
	const dates = {
		historical: '2026-03-11',
		start: '2026-09-14',
		middle: '2026-09-15',
		end: '2026-09-16',
		later: '2026-10-14',
		closure: '2026-09-15'
	};
	const now = new Date();
	const localDate = (date) =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	dates.ui = localDate(now);
	dates.uiBefore = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
	dates.uiAfter = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
	checked(
		await service.from('status_types').insert([
			{
				id: ids.statusLeave,
				organization_id: ids.orgA,
				name: 'Verification Leave',
				color: '#166534',
				text_color: '#ffffff',
				sort_order: 11
			},
			{
				id: ids.statusTraining,
				organization_id: ids.orgA,
				name: 'Verification Training',
				color: '#1d4ed8',
				text_color: '#ffffff',
				sort_order: 12
			},
			{
				id: ids.statusDelete,
				organization_id: ids.orgA,
				name: 'Verification Retiring Status',
				color: '#7c2d12',
				text_color: '#ffffff',
				sort_order: 13
			},
			{
				id: ids.statusForeign,
				organization_id: ids.orgB,
				name: 'Foreign Private Status',
				color: '#7e22ce',
				text_color: '#ffffff',
				sort_order: 11
			}
		])
	);
	checked(
		await service.from('assignment_types').insert([
			{
				id: ids.typePersonnel,
				organization_id: ids.orgA,
				name: 'Verification Staff Duty',
				short_name: 'VSD',
				assign_to: 'personnel',
				color: '#166534',
				sort_order: 11,
				exempt_personnel_ids: [ids.personB],
				show_in_date_header: true
			},
			{
				id: ids.typeGroup,
				organization_id: ids.orgA,
				name: 'Verification Group Duty',
				short_name: 'VGD',
				assign_to: 'group',
				color: '#1d4ed8',
				sort_order: 12,
				exempt_personnel_ids: [],
				show_in_date_header: false
			},
			{
				id: ids.typeDelete,
				organization_id: ids.orgA,
				name: 'Verification Retiring Duty',
				short_name: 'VRD',
				assign_to: 'personnel',
				color: '#7c2d12',
				sort_order: 13,
				exempt_personnel_ids: [],
				show_in_date_header: false
			},
			{
				id: ids.typeArchived,
				organization_id: ids.orgA,
				name: 'Verification Archived Duty',
				short_name: 'VAD',
				assign_to: 'personnel',
				color: '#525252',
				sort_order: 14,
				exempt_personnel_ids: [],
				show_in_date_header: false,
				archived_at: '2025-12-31T00:00:00Z'
			},
			{
				id: ids.typeForeign,
				organization_id: ids.orgB,
				name: 'Foreign Private Duty',
				short_name: 'FPD',
				assign_to: 'personnel',
				color: '#7e22ce',
				sort_order: 11,
				exempt_personnel_ids: [],
				show_in_date_header: false
			}
		])
	);
	checked(
		await service.from('availability_entries').insert([
			{
				id: ids.availabilityHistorical,
				organization_id: ids.orgA,
				personnel_id: ids.personA,
				status_type_id: ids.statusLeave,
				start_date: dates.historical,
				end_date: dates.historical,
				note: 'Historical retained'
			},
			{
				id: ids.availabilityAlpha,
				organization_id: ids.orgA,
				personnel_id: ids.personA,
				status_type_id: ids.statusLeave,
				start_date: dates.start,
				end_date: dates.end,
				note: 'Alpha seeded leave'
			},
			{
				id: ids.availabilityBravo,
				organization_id: ids.orgA,
				personnel_id: ids.personB,
				status_type_id: ids.statusTraining,
				start_date: dates.middle,
				end_date: dates.middle,
				note: 'Bravo seeded training'
			},
			{
				id: ids.availabilityCurrent,
				organization_id: ids.orgA,
				personnel_id: ids.personB,
				status_type_id: ids.statusTraining,
				start_date: dates.uiBefore,
				end_date: dates.uiAfter,
				note: 'Current training spans selected removal date'
			},
			{
				id: ids.availabilityUnassigned,
				organization_id: ids.orgA,
				personnel_id: ids.personUnassigned,
				status_type_id: ids.statusLeave,
				start_date: dates.middle,
				end_date: dates.middle,
				note: 'Unassigned seeded leave'
			},
			{
				id: ids.availabilityDelete,
				organization_id: ids.orgA,
				personnel_id: ids.personB,
				status_type_id: ids.statusDelete,
				start_date: dates.later,
				end_date: dates.later,
				note: 'Deliberate status cleanup'
			},
			{
				id: ids.availabilityForeign,
				organization_id: ids.orgB,
				personnel_id: ids.personForeign,
				status_type_id: ids.statusForeign,
				start_date: dates.start,
				end_date: dates.end,
				note: 'Foreign private leave'
			}
		])
	);
	checked(
		await service.from('daily_assignments').insert([
			{
				id: ids.assignmentPersonnel,
				organization_id: ids.orgA,
				assignment_type_id: ids.typePersonnel,
				date: dates.middle,
				assignee_id: ids.personA
			},
			{
				id: ids.assignmentGroup,
				organization_id: ids.orgA,
				assignment_type_id: ids.typeGroup,
				date: dates.middle,
				assignee_id: ids.groupA
			},
			{
				id: ids.assignmentDelete,
				organization_id: ids.orgA,
				assignment_type_id: ids.typeDelete,
				date: dates.middle,
				assignee_id: ids.personB
			},
			{
				id: ids.assignmentArchived,
				organization_id: ids.orgA,
				assignment_type_id: ids.typeArchived,
				date: dates.middle,
				assignee_id: ids.personA
			},
			{
				id: ids.assignmentForeign,
				organization_id: ids.orgB,
				assignment_type_id: ids.typeForeign,
				date: dates.middle,
				assignee_id: ids.personForeign
			}
		])
	);
	checked(
		await service.from('special_days').insert([
			{
				id: ids.closureA,
				organization_id: ids.orgA,
				date: dates.closure,
				name: 'Verification Unit Closure',
				type: 'org-closure'
			},
			{
				id: ids.closureB,
				organization_id: ids.orgB,
				date: dates.closure,
				name: 'Foreign Private Closure',
				type: 'org-closure'
			},
			{
				id: ids.holidayCustom,
				organization_id: ids.orgA,
				date: '2026-09-18',
				name: 'Verification Custom Holiday',
				type: 'federal-holiday'
			}
		])
	);
	const fixture = { ids, actors, dates, calendarActors };
	await writeJSON(path.join(session, 'fixtures.json'), fixture);
	return fixture;
}
