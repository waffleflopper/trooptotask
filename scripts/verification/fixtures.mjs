import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
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
			'orgOwnerMembership',
			'orgAdminMembership',
			'orgMemberMembership',
			'groupA',
			'groupB',
			'groupForeign',
			'rankActiveA',
			'rankRetiredA',
			'rankActiveB',
			'personA',
			'personB',
			'personUnassigned',
			'personForeign',
			'trainingRequired',
			'trainingTargeted',
			'trainingOptional',
			'trainingForeignType',
			'trainingView',
			'trainingForeignView',
			'trainingCurrent',
			'onboardingTemplate',
			'onboardingForeignTemplate',
			'onboardingCheckbox',
			'onboardingPaperwork',
			'onboardingTraining',
			'onboardingForeignStep',
			'onboardingPacket',
			'onboardingCheckboxProgress',
			'onboardingPaperworkProgress',
			'onboardingTrainingProgress',
			'ictTaskAlpha',
			'ictTaskGeneral',
			'ictTaskArchived',
			'ictTaskForeign',
			'ictCompletionAlpha',
			'rosterAlpha',
			'rosterMixed',
			'rosterUnassigned',
			'rosterForeign',
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
	const rankCatalog = {
		activeA: { id: ids.rankActiveA, organization: 'orgA', code: 'VFY-ACTIVE-A', state: 'active' },
		retiredA: { id: ids.rankRetiredA, organization: 'orgA', code: 'VFY-RETIRED-A', state: 'retired' },
		activeB: { id: ids.rankActiveB, organization: 'orgB', code: 'VFY-ONLY-B', state: 'active' }
	};
	const password = `Synthetic-${randomUUID()}!9`;
	const actors = {};
	const personnelActors = {
		personnelOperate: { personnel: 'operate', scope: 'organization' },
		personnelScoped: { personnel: 'configure', scope: 'groups', groups: [ids.groupA] },
		personnelEmpty: { personnel: 'configure', scope: 'groups', groups: [] },
		personnelSwitch: { personnel: 'configure', scope: 'organization' }
	};
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
	const trainingActors = {
		trainingConfigure: { organization: 'orgA', training: 'configure', personnel: 'none', scope: 'organization' },
		trainingView: { organization: 'orgA', training: 'view', personnel: 'none', scope: 'organization' },
		trainingOperate: { organization: 'orgA', training: 'operate', personnel: 'none', scope: 'organization' },
		trainingEmpty: { organization: 'orgA', training: 'operate', personnel: 'none', scope: 'groups', groups: [] },
		trainingSwitch: { organization: 'orgA', training: 'operate', personnel: 'none', scope: 'organization' },
		trainingOnboarding: {
			organization: 'orgA',
			training: 'view',
			onboarding: 'configure',
			personnel: 'view',
			scope: 'organization'
		},
		trainingScoped: {
			organization: 'orgA',
			training: 'view',
			personnel: 'none',
			scope: 'groups',
			groups: [ids.groupA]
		},
		trainingScopedConfig: {
			organization: 'orgA',
			training: 'configure',
			personnel: 'none',
			scope: 'groups',
			groups: [ids.groupA]
		},
		trainingForeign: { organization: 'orgB', training: 'configure', personnel: 'none', scope: 'organization' },
		rosterManager: { organization: 'orgA', training: 'operate', personnel: 'configure', scope: 'organization' },
		rosterViewer: { organization: 'orgA', training: 'view', scope: 'organization' },
		rosterScoped: {
			organization: 'orgA',
			training: 'operate',
			personnel: 'none',
			scope: 'groups',
			groups: [ids.groupA]
		},
		rosterForeign: { organization: 'orgB', training: 'operate', scope: 'organization' }
	};
	const criticalTasksActors = {
		ictConfigurator: { organization: 'orgA', criticalTasks: 'configure', scope: 'organization' },
		ictOperator: { organization: 'orgA', criticalTasks: 'operate', scope: 'organization' },
		ictViewer: { organization: 'orgA', criticalTasks: 'view', scope: 'organization' },
		ictEmpty: { organization: 'orgA', criticalTasks: 'operate', scope: 'groups', groups: [] },
		ictSwitch: { organization: 'orgA', criticalTasks: 'operate', scope: 'organization' },
		ictScoped: {
			organization: 'orgA',
			criticalTasks: 'configure',
			scope: 'groups',
			groups: [ids.groupA]
		},
		ictForeign: { organization: 'orgB', criticalTasks: 'configure', scope: 'organization' }
	};
	const onboardingActors = {
		onboardingConfigure: { organization: 'orgA', onboarding: 'configure', scope: 'organization' },
		onboardingOperate: { organization: 'orgA', onboarding: 'operate', scope: 'organization' },
		onboardingView: { organization: 'orgA', onboarding: 'view', scope: 'organization' },
		onboardingScoped: { organization: 'orgA', onboarding: 'configure', scope: 'groups', groups: [ids.groupA] },
		onboardingEmpty: { organization: 'orgA', onboarding: 'configure', scope: 'groups', groups: [] },
		onboardingPersonnelScoped: {
			organization: 'orgA',
			onboarding: 'configure',
			personnel: 'configure',
			scope: 'groups',
			groups: [ids.groupA]
		},
		onboardingForeign: { organization: 'orgB', onboarding: 'configure', scope: 'organization' },
		onboardingSwitch: { organization: 'orgA', onboarding: 'configure', scope: 'organization' }
	};
	const organizationActors = {
		orgOwner: { organization: 'orgA', role: 'owner', scope: 'organization' },
		orgAdmin: { organization: 'orgA', role: 'admin', scope: 'organization' },
		orgMember: { organization: 'orgA', role: 'member', scope: 'groups', groups: [ids.groupA] },
		orgInvitee: { organization: null },
		orgCreator: { organization: null }
	};
	const notificationActors = {
		notificationMember: { organization: 'orgA' },
		notificationOther: { organization: 'orgA' },
		notificationForeign: { organization: 'orgB' },
		notificationSwitch: { organization: 'orgA' }
	};
	const organizationMembershipIds = {
		orgOwner: ids.orgOwnerMembership,
		orgAdmin: ids.orgAdminMembership,
		orgMember: ids.orgMemberMembership
	};
	for (const role of [
		'manager',
		'viewer',
		'scoped',
		'foreign',
		...Object.keys(personnelActors),
		...Object.keys(calendarActors),
		...Object.keys(trainingActors),
		...Object.keys(criticalTasksActors),
		...Object.keys(onboardingActors),
		...Object.keys(organizationActors),
		...Object.keys(notificationActors)
	]) {
		const email = `${role}-${randomUUID()}@example.test`;
		const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
		actors[role] = {
			email,
			password,
			id: user.id,
			organization: Object.hasOwn(organizationActors, role)
				? organizationActors[role].organization
				: (calendarActors[role]?.organization ??
					trainingActors[role]?.organization ??
					criticalTasksActors[role]?.organization ??
					onboardingActors[role]?.organization ??
					notificationActors[role]?.organization ??
					(role === 'foreign' ? 'orgB' : 'orgA'))
		};
	}
	const invitationEmails = {
		existingAccount: actors.orgInvitee.email,
		newAccount: `org-new-invitee-${randomUUID()}@example.test`
	};
	checked(
		await service.from('organizations').insert([
			{ id: ids.orgA, name: 'Verification Organization A', created_by: actors.orgOwner.id },
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
	// Personnel create/import needs an active catalog; direct Organization fixtures
	// do not run the application's provisioning workflow.
	checked(
		await service.from('organization_rank_catalog').insert([
			...[ids.orgA, ids.orgB].flatMap((organizationId) =>
				[
					['PFC', 'Private First Class', 'E-3', 3],
					['SPC', 'Specialist', 'E-4', 4],
					['SGT', 'Sergeant', 'E-5', 5]
				].map(([code, label, payGrade, order]) => ({
					id: randomUUID(),
					organization_id: organizationId,
					code,
					label,
					pay_grade: payGrade,
					service: 'army',
					category: 'enlisted',
					state: 'active',
					source: 'built-in',
					sort_order: order
				}))
			),
			...Object.values(rankCatalog).map((rank, index) => ({
				id: rank.id,
				organization_id: ids[rank.organization],
				code: rank.code,
				label: rank.code,
				pay_grade: 'ungraded',
				service: 'custom',
				category: 'custom',
				state: rank.state,
				source: 'custom',
				sort_order: 100 + index
			}))
		])
	);
	for (const [role, actor] of Object.entries(actors)) {
		if (actor.organization === null) continue;
		const personnel = personnelActors[role];
		const calendar = calendarActors[role];
		const training = trainingActors[role];
		const criticalTasks = criticalTasksActors[role];
		const onboarding = onboardingActors[role];
		const organization = organizationActors[role];
		const notification = notificationActors[role];
		checked(
			await service.from('organization_memberships').insert({
				...(organizationMembershipIds[role] ? { id: organizationMembershipIds[role] } : {}),
				organization_id: ids[actor.organization],
				user_id: actor.id,
				...(organization ? { email: actor.email } : {}),
				role: organization?.role ?? calendar?.role ?? 'member',
				member_preset: 'viewer',
				capability_overrides: {
					personnel:
						onboarding?.personnel ??
						(criticalTasks || onboarding || notification
							? 'none'
							: (personnel?.personnel ??
								calendar?.personnel ??
								training?.personnel ??
								(role === 'manager' ? 'configure' : 'view'))),
					calendar: calendar?.calendar ?? 'none',
					training: training?.training ?? 'none',
					criticalTasks: criticalTasks?.criticalTasks ?? 'none',
					onboarding: onboarding?.onboarding ?? training?.onboarding ?? 'none',
					ratingScheme: 'none'
				},
				access_scope_kind:
					organization?.scope ??
					personnel?.scope ??
					calendar?.scope ??
					training?.scope ??
					criticalTasks?.scope ??
					onboarding?.scope ??
					(role === 'scoped' ? 'groups' : 'organization'),
				access_scope_group_ids:
					organization?.groups ??
					personnel?.groups ??
					calendar?.groups ??
					training?.groups ??
					criticalTasks?.groups ??
					onboarding?.groups ??
					(role === 'scoped' ? [ids.groupA] : [])
			})
		);
	}
	checked(
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.notificationSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'none',
				calendar: 'none',
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
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.ictSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'none',
				calendar: 'none',
				training: 'none',
				criticalTasks: 'view',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		})
	);
	checked(
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.personnelSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'view',
				calendar: 'none',
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
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.trainingSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'none',
				calendar: 'none',
				training: 'view',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		})
	);
	checked(
		await service.from('organization_memberships').insert({
			organization_id: ids.orgB,
			user_id: actors.onboardingSwitch.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: {
				personnel: 'none',
				calendar: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'view',
				ratingScheme: 'none'
			},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		})
	);
	checked(
		await service.from('personnel').insert(
			[
				['personA', ids.orgA, ids.groupA, 'Able', '68W', 'Medic'],
				['personB', ids.orgA, ids.groupB, 'Baker', '11B', 'NCO'],
				['personUnassigned', ids.orgA, null, 'Unassigned', '68W', 'NCO'],
				['personForeign', ids.orgB, ids.groupForeign, 'Foreign', '11B', 'Medic']
			].map(([key, org, group, name, mos, clinicRole]) => ({
				id: ids[key],
				organization_id: org,
				group_id: group,
				first_name: 'Synthetic',
				last_name: name,
				rank: 'SPC',
				mos,
				clinic_role: clinicRole,
				slug: `verify-${name.toLowerCase()}`
			}))
		)
	);
	checked(
		await service.from('ict_tasks').insert([
			{
				id: ids.ictTaskAlpha,
				organization_id: ids.orgA,
				task_code: 'VERIFY-ICT-ALPHA',
				title: 'Verification Alpha Critical Task',
				category: 'Clinical',
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 11
			},
			{
				id: ids.ictTaskGeneral,
				organization_id: ids.orgA,
				task_code: 'VERIFY-ICT-ALL',
				title: 'Verification All-MOS Critical Task',
				mos: [],
				sort_order: 12
			},
			{
				id: ids.ictTaskArchived,
				organization_id: ids.orgA,
				task_code: 'VERIFY-ICT-ARCHIVED',
				title: 'Verification Archived Critical Task',
				mos: ['68W'],
				sort_order: 13,
				archived_at: '2026-01-01T00:00:00Z'
			},
			{
				id: ids.ictTaskForeign,
				organization_id: ids.orgB,
				task_code: 'VERIFY-ICT-FOREIGN',
				title: 'Foreign Private Critical Task',
				mos: ['68W'],
				sort_order: 11
			}
		])
	);
	checked(
		await service.from('personnel_ict_completions').insert({
			id: ids.ictCompletionAlpha,
			organization_id: ids.orgA,
			personnel_id: ids.personA,
			ict_task_id: ids.ictTaskAlpha,
			completed_at: '2026-09-14',
			validation_method: 'Demonstration',
			logged_by: actors.ictConfigurator.id
		})
	);
	const alphaScanPath = `${ids.orgA}/sign-in-rosters/${ids.rosterAlpha}/verification-signed.pdf`;
	checked(
		await service.from('sign_in_rosters').insert([
			{
				id: ids.rosterAlpha,
				organization_id: ids.orgA,
				title: 'Verification Alpha Snapshot',
				roster_date: '2026-09-14',
				personnel_snapshot: [
					{ id: ids.personA, rank: 'PFC', lastName: 'Able', firstName: 'Prior', group: 'Alpha', groupId: ids.groupA }
				],
				personnel_ids: [ids.personA],
				scope_group_ids: [ids.groupA],
				filter_config: { groups: ['Alpha'], ranks: ['PFC'] },
				signed_file_path: alphaScanPath,
				created_by: actors.rosterManager.id
			},
			{
				id: ids.rosterMixed,
				organization_id: ids.orgA,
				title: 'Verification Mixed Snapshot',
				roster_date: '2026-09-15',
				personnel_snapshot: [
					{
						id: ids.personA,
						rank: 'SPC',
						lastName: 'Able',
						firstName: 'Synthetic',
						group: 'Alpha',
						groupId: ids.groupA
					},
					{
						id: ids.personB,
						rank: 'SPC',
						lastName: 'Baker',
						firstName: 'Synthetic',
						group: 'Bravo',
						groupId: ids.groupB
					}
				],
				personnel_ids: [ids.personA, ids.personB],
				scope_group_ids: [ids.groupA, ids.groupB],
				created_by: actors.rosterManager.id
			},
			{
				id: ids.rosterUnassigned,
				organization_id: ids.orgA,
				title: 'Verification Unassigned Snapshot',
				roster_date: '2026-09-15',
				personnel_snapshot: [
					{
						id: ids.personUnassigned,
						rank: 'SPC',
						lastName: 'Unassigned',
						firstName: 'Synthetic',
						group: '',
						groupId: null
					}
				],
				personnel_ids: [ids.personUnassigned],
				scope_group_ids: [],
				created_by: actors.rosterManager.id
			},
			{
				id: ids.rosterForeign,
				organization_id: ids.orgB,
				title: 'Foreign Private Snapshot',
				roster_date: '2026-09-16',
				personnel_snapshot: [
					{
						id: ids.personForeign,
						rank: 'SPC',
						lastName: 'Foreign',
						firstName: 'Synthetic',
						group: 'Foreign',
						groupId: ids.groupForeign
					}
				],
				personnel_ids: [ids.personForeign],
				scope_group_ids: [ids.groupForeign],
				created_by: actors.rosterForeign.id
			}
		])
	);
	const signedScan = new jsPDF();
	signedScan.text('Synthetic signed scan for Verification Alpha Snapshot', 20, 20);
	const pdf = Buffer.from(signedScan.output('arraybuffer'));
	checked(
		await service.storage.from('counseling-files').upload(alphaScanPath, pdf, { contentType: 'application/pdf' })
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
	// D11 records these examples through the UI, preserving the library baseline.
	// Clamp the anniversary before deriving a 12-month completion for leap years.
	const ictWarningExpiration = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15);
	if (ictWarningExpiration.getMonth() === 1 && ictWarningExpiration.getDate() === 29) ictWarningExpiration.setDate(28);
	dates.ictWarningExpires = localDate(ictWarningExpiration);
	dates.ictWarningCompleted = localDate(
		new Date(ictWarningExpiration.getFullYear() - 1, ictWarningExpiration.getMonth(), ictWarningExpiration.getDate())
	);
	dates.ictExpiredCompleted = localDate(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()));
	dates.ictExpiredExpires = localDate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
	const trainingCompleted = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
	dates.trainingCompleted = localDate(trainingCompleted);
	dates.trainingExpires = localDate(
		new Date(trainingCompleted.getFullYear() + 1, trainingCompleted.getMonth(), trainingCompleted.getDate())
	);
	// Completion/report journeys add these records through the UI; keep D08's
	// original missing-completion examples unchanged at launch.
	dates.trainingExpiredCompleted = localDate(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()));
	dates.trainingExpiredExpires = localDate(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
	const trainingWarningExpires = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15);
	// A 12-month completion cannot expire on Feb 29 after a non-leap year.
	if (trainingWarningExpires.getMonth() === 1 && trainingWarningExpires.getDate() === 29)
		trainingWarningExpires.setDate(28);
	dates.trainingWarningDays = String(
		Math.round(
			(Date.UTC(
				trainingWarningExpires.getFullYear(),
				trainingWarningExpires.getMonth(),
				trainingWarningExpires.getDate()
			) -
				Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
				86400000
		)
	);
	dates.trainingWarningExpires = localDate(trainingWarningExpires);
	dates.trainingWarningCompleted = localDate(
		new Date(
			trainingWarningExpires.getFullYear() - 1,
			trainingWarningExpires.getMonth(),
			trainingWarningExpires.getDate()
		)
	);
	const trainingTypeDefaults = {
		description: null,
		expiration_months: null,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		applies_to_roles: [],
		applies_to_mos: [],
		applies_to_ranks: [],
		excluded_roles: [],
		excluded_mos: [],
		excluded_ranks: [],
		color: '#6b7280',
		expiration_date_only: false,
		can_be_exempted: false,
		exempt_personnel_ids: [],
		is_optional: false
	};
	checked(
		await service.from('training_types').insert([
			{
				...trainingTypeDefaults,
				id: ids.trainingRequired,
				organization_id: ids.orgA,
				name: 'Verification Required Training',
				expiration_months: 12,
				sort_order: 10
			},
			{
				...trainingTypeDefaults,
				id: ids.trainingTargeted,
				organization_id: ids.orgA,
				name: 'Verification Targeted Training',
				expiration_months: 12,
				applies_to_mos: ['68W'],
				excluded_roles: ['NCO'],
				sort_order: 20
			},
			{
				...trainingTypeDefaults,
				id: ids.trainingOptional,
				organization_id: ids.orgA,
				name: 'Verification Optional Training',
				is_optional: true,
				sort_order: 30
			},
			{
				...trainingTypeDefaults,
				id: ids.trainingForeignType,
				organization_id: ids.orgB,
				name: 'Foreign Private Training',
				sort_order: 10
			}
		])
	);
	checked(
		await service.from('onboarding_templates').insert([
			{
				id: ids.onboardingTemplate,
				organization_id: ids.orgA,
				name: 'Verification Onboarding A',
				description: 'Synthetic A template description'
			},
			{
				id: ids.onboardingForeignTemplate,
				organization_id: ids.orgB,
				name: 'Foreign Private Onboarding',
				description: 'Synthetic B template description'
			}
		])
	);
	const onboardingSteps = [
		{
			id: ids.onboardingCheckbox,
			organization_id: ids.orgA,
			template_id: ids.onboardingTemplate,
			name: 'Verification Orientation',
			description: 'Synthetic checkbox instructions',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0
		},
		{
			id: ids.onboardingPaperwork,
			organization_id: ids.orgA,
			template_id: ids.onboardingTemplate,
			name: 'Verification Paperwork',
			description: 'Synthetic paperwork instructions',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted', 'Reviewed', 'Filed'],
			sort_order: 1
		},
		{
			id: ids.onboardingTraining,
			organization_id: ids.orgA,
			template_id: ids.onboardingTemplate,
			name: 'Verification Training Step',
			description: 'Synthetic training instructions',
			step_type: 'training',
			training_type_id: ids.trainingRequired,
			stages: null,
			sort_order: 2
		},
		{
			id: ids.onboardingForeignStep,
			organization_id: ids.orgB,
			template_id: ids.onboardingForeignTemplate,
			name: 'Foreign Private Step',
			description: null,
			step_type: 'training',
			training_type_id: ids.trainingForeignType,
			stages: null,
			sort_order: 0
		}
	];
	checked(await service.from('onboarding_template_steps').insert(onboardingSteps));
	// Completed history provides a linked snapshot without changing active Calendar markers.
	checked(
		await service.from('personnel_onboardings').insert({
			id: ids.onboardingPacket,
			organization_id: ids.orgA,
			personnel_id: ids.personA,
			template_id: ids.onboardingTemplate,
			started_at: '2026-03-01',
			completed_at: '2026-03-18',
			status: 'completed'
		})
	);
	checked(
		await service.from('onboarding_step_progress').insert(
			onboardingSteps
				.filter((step) => step.organization_id === ids.orgA)
				.map((step, index) => ({
					id: [ids.onboardingCheckboxProgress, ids.onboardingPaperworkProgress, ids.onboardingTrainingProgress][index],
					organization_id: ids.orgA,
					onboarding_id: ids.onboardingPacket,
					template_step_id: step.id,
					step_name: step.name,
					step_type: step.step_type,
					training_type_id: step.training_type_id,
					stages: step.stages,
					sort_order: step.sort_order,
					completed: true,
					current_stage: step.step_type === 'paperwork' ? 'Filed' : null,
					notes:
						step.step_type === 'paperwork'
							? [
									{
										text: 'Synthetic retained filing note',
										timestamp: '2026-03-18T12:00:00.000Z',
										userId: actors.onboardingConfigure.id
									}
								]
							: []
				}))
		)
	);
	checked(
		await service.from('training_views').insert([
			{
				id: ids.trainingView,
				organization_id: ids.orgA,
				name: 'Verification Focus View',
				column_ids: [ids.trainingTargeted, ids.trainingRequired],
				created_by: actors.trainingConfigure.id
			},
			{
				id: ids.trainingForeignView,
				organization_id: ids.orgB,
				name: 'Foreign Private View',
				column_ids: [ids.trainingForeignType],
				created_by: actors.trainingForeign.id
			}
		])
	);
	checked(
		await service.from('personnel_trainings').insert({
			id: ids.trainingCurrent,
			organization_id: ids.orgA,
			personnel_id: ids.personA,
			training_type_id: ids.trainingRequired,
			completion_date: dates.trainingCompleted,
			expiration_date: dates.trainingExpires
		})
	);
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
	const fixture = {
		ids,
		rankCatalog,
		actors,
		dates,
		invitationEmails,
		calendarActors,
		trainingActors,
		criticalTasksActors,
		onboardingActors,
		organizationActors,
		notificationActors
	};
	await writeJSON(path.join(session, 'fixtures.json'), fixture);
	return fixture;
}
