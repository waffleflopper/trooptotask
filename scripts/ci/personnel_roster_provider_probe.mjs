import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const url = process.env.T2T_PROBE_API_URL;
const serviceKey = process.env.T2T_PROBE_SERVICE_KEY;
const anonKey = process.env.T2T_PROBE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, 'Disposable provider coordinates are required');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = {
	orgA: 'f1000000-0000-4000-8000-000000000101',
	orgB: 'f1000000-0000-4000-8000-000000000102',
	groupA1: 'f1000000-0000-4000-8000-000000000201',
	groupA2: 'f1000000-0000-4000-8000-000000000202',
	groupB: 'f1000000-0000-4000-8000-000000000203',
	activeA1: 'f1000000-0000-4000-8000-000000000301',
	archivedA1: 'f1000000-0000-4000-8000-000000000302',
	activeA2: 'f1000000-0000-4000-8000-000000000303',
	activeUnassigned: 'f1000000-0000-4000-8000-000000000304',
	archivedUnassigned: 'f1000000-0000-4000-8000-000000000305',
	foreign: 'f1000000-0000-4000-8000-000000000306'
};
const orgActive = [ids.activeA1, ids.activeA2, ids.activeUnassigned];
const orgAll = [ids.activeA1, ids.archivedA1, ids.activeA2, ids.activeUnassigned, ids.archivedUnassigned];
const groupAll = [ids.activeA1, ids.archivedA1];
const laneNames = ['calendar', 'personnel', 'training', 'criticalTasks', 'onboarding', 'ratingScheme'];
const password = 'ProbeRoster9!';

function dataOrThrow(result, step) {
	if (result.error) throw new Error(`${step} failed (${result.error.code ?? 'unknown'}): ${result.error.message}`);
	return result.data;
}

function capabilities(lane) {
	return Object.fromEntries(laneNames.map((name) => [name, name === lane ? 'view' : 'none']));
}

async function createActor(label, lane, orgId, groupIds) {
	const email = `probe-roster-${label}-${randomUUID()}@example.test`;
	const user = dataOrThrow(
		await service.auth.admin.createUser({ email, password, email_confirm: true }),
		`${label} Auth user`
	).user;
	assert.ok(user?.id);
	const capabilityMap = capabilities(lane);
	const scopeSet = groupIds === null ? { kind: 'organization' } : { kind: 'groups', groupIds };
	const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
	dataOrThrow(await client.auth.signInWithPassword({ email, password }), `${label} sign-in`);
	return {
		client,
		membership: {
			organization_id: orgId,
			user_id: user.id,
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: capabilityMap,
			access_scope_kind: scopeSet.kind,
			access_scope_group_ids: groupIds ?? []
		},
		actor: {
			userId: user.id,
			orgId,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap,
			scopeSet
		}
	};
}

const actors = {
	calendarGroup: await createActor('calendar-group', 'calendar', ids.orgA, [ids.groupA1]),
	onboardingGroup: await createActor('onboarding-group', 'onboarding', ids.orgA, [ids.groupA1]),
	calendarOrg: await createActor('calendar-org', 'calendar', ids.orgA, null),
	onboardingOrg: await createActor('onboarding-org', 'onboarding', ids.orgA, null),
	calendarEmpty: await createActor('calendar-empty', 'calendar', ids.orgA, []),
	onboardingEmpty: await createActor('onboarding-empty', 'onboarding', ids.orgA, []),
	calendarForeign: await createActor('calendar-foreign', 'calendar', ids.orgB, [ids.groupB]),
	onboardingForeign: await createActor('onboarding-foreign', 'onboarding', ids.orgB, [ids.groupB]),
	denied: await createActor('denied', null, ids.orgA, [ids.groupA1])
};

dataOrThrow(
	await service.from('organizations').insert([
		{ id: ids.orgA, name: 'Roster Probe A', created_by: actors.calendarGroup.actor.userId },
		{ id: ids.orgB, name: 'Roster Probe B', created_by: actors.calendarForeign.actor.userId }
	]),
	'Organizations'
);
dataOrThrow(
	await service.from('groups').insert([
		{ id: ids.groupA1, organization_id: ids.orgA, name: 'Alpha' },
		{ id: ids.groupA2, organization_id: ids.orgA, name: 'Bravo' },
		{ id: ids.groupB, organization_id: ids.orgB, name: 'Foreign' }
	]),
	'Groups'
);
dataOrThrow(
	await service.from('organization_memberships').insert(Object.values(actors).map(({ membership }) => membership)),
	'memberships'
);
dataOrThrow(
	await service.from('personnel').insert([
		{
			id: ids.activeA1,
			organization_id: ids.orgA,
			group_id: ids.groupA1,
			rank: 'SPC',
			first_name: 'Ava',
			last_name: 'Able',
			slug: 'probe-ava-able',
			clinic_role: ''
		},
		{
			id: ids.archivedA1,
			organization_id: ids.orgA,
			group_id: ids.groupA1,
			rank: 'SPC',
			first_name: 'Ben',
			last_name: 'Baker',
			slug: 'probe-ben-baker',
			clinic_role: '',
			archived_at: '2030-01-01T00:00:00Z'
		},
		{
			id: ids.activeA2,
			organization_id: ids.orgA,
			group_id: ids.groupA2,
			rank: 'SPC',
			first_name: 'Cal',
			last_name: 'Clark',
			slug: 'probe-cal-clark',
			clinic_role: ''
		},
		{
			id: ids.activeUnassigned,
			organization_id: ids.orgA,
			group_id: null,
			rank: 'SPC',
			first_name: 'Dee',
			last_name: 'Davis',
			slug: 'probe-dee-davis',
			clinic_role: ''
		},
		{
			id: ids.archivedUnassigned,
			organization_id: ids.orgA,
			group_id: null,
			rank: 'SPC',
			first_name: 'Eli',
			last_name: 'Evans',
			slug: 'probe-eli-evans',
			clinic_role: '',
			archived_at: '2030-01-02T00:00:00Z'
		},
		{
			id: ids.foreign,
			organization_id: ids.orgB,
			group_id: ids.groupB,
			rank: 'SPC',
			first_name: 'Fay',
			last_name: 'Foster',
			slug: 'probe-fay-foster',
			clinic_role: ''
		}
	]),
	'Personnel'
);

for (const [label, { client, actor }] of Object.entries(actors)) {
	const membership = dataOrThrow(
		await client.from('organization_memberships').select('user_id,organization_id').eq('user_id', actor.userId),
		`${label} authenticated membership SELECT`
	);
	assert.deepEqual(membership, [{ user_id: actor.userId, organization_id: actor.orgId }]);
	const rows = dataOrThrow(await client.from('personnel').select('id'), `${label} direct Personnel SELECT`);
	assert.deepEqual(rows, [], `${label} must not gain Personnel row access from another lane`);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const previousCwd = process.cwd();
process.chdir(root);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
	const { createSupabasePersonnelCalendarRosterPort } = await vite.ssrLoadModule(
		'/src/features/personnel/calendarRoster.server.ts'
	);
	const { createSupabasePersonnelOnboardingRosterPort } = await vite.ssrLoadModule(
		'/src/features/personnel/onboardingRoster.server.ts'
	);
	const calendar = createSupabasePersonnelCalendarRosterPort(() => service);
	const onboarding = createSupabasePersonnelOnboardingRosterPort(() => service);
	const idsOf = (people) => people.map((person) => person.id);
	const groupEntries = (groups) => [...groups];

	assert.deepEqual(idsOf(await calendar.listActive(actors.calendarGroup.actor)), [ids.activeA1]);
	assert.deepEqual(await calendar.listAssigneeIds(actors.calendarGroup.actor), groupAll);
	assert.deepEqual(
		groupEntries(await calendar.findGroupIds(actors.calendarGroup.actor, [...orgAll, ids.foreign])),
		groupAll.map((id) => [id, ids.groupA1])
	);
	assert.deepEqual(idsOf(await calendar.listActive(actors.calendarOrg.actor)), orgActive);
	assert.deepEqual(await calendar.listAssigneeIds(actors.calendarOrg.actor), orgAll);
	assert.deepEqual(
		groupEntries(
			await calendar.findGroupIds(actors.calendarOrg.actor, [ids.activeUnassigned, ids.archivedUnassigned, ids.foreign])
		),
		[
			[ids.activeUnassigned, null],
			[ids.archivedUnassigned, null]
		]
	);
	assert.deepEqual(idsOf(await calendar.listActive(actors.calendarForeign.actor)), [ids.foreign]);
	assert.deepEqual(await calendar.findGroupIds(actors.calendarForeign.actor, [ids.activeA1]), new Map());

	assert.deepEqual(idsOf(await onboarding.listRoster(actors.onboardingGroup.actor, 'active')), [ids.activeA1]);
	assert.deepEqual(idsOf(await onboarding.listRoster(actors.onboardingGroup.actor, 'all')), groupAll);
	assert.deepEqual(
		groupEntries(await onboarding.findGroupIds(actors.onboardingGroup.actor, [...orgAll, ids.foreign])),
		groupAll.map((id) => [id, ids.groupA1])
	);
	assert.deepEqual(idsOf(await onboarding.listRoster(actors.onboardingOrg.actor, 'active')), orgActive);
	assert.deepEqual(idsOf(await onboarding.listRoster(actors.onboardingOrg.actor, 'all')), orgAll);
	assert.deepEqual(
		groupEntries(
			await onboarding.findGroupIds(actors.onboardingOrg.actor, [
				ids.activeUnassigned,
				ids.archivedUnassigned,
				ids.foreign
			])
		),
		[
			[ids.activeUnassigned, null],
			[ids.archivedUnassigned, null]
		]
	);
	assert.deepEqual(idsOf(await onboarding.listRoster(actors.onboardingForeign.actor, 'all')), [ids.foreign]);
	assert.deepEqual(await onboarding.findGroupIds(actors.onboardingForeign.actor, [ids.activeA1]), new Map());

	const noAdminClient = () => {
		throw new Error('Denied or empty Group scope opened the admin client');
	};
	const emptyCalendar = createSupabasePersonnelCalendarRosterPort(noAdminClient);
	const emptyOnboarding = createSupabasePersonnelOnboardingRosterPort(noAdminClient);
	assert.deepEqual(await emptyCalendar.listActive(actors.calendarEmpty.actor), []);
	assert.deepEqual(await emptyCalendar.listAssigneeIds(actors.calendarEmpty.actor), []);
	assert.deepEqual(await emptyOnboarding.listRoster(actors.onboardingEmpty.actor, 'all'), []);
	assert.deepEqual(await emptyOnboarding.findGroupIds(actors.onboardingEmpty.actor, [ids.activeA1]), new Map());
	await assert.rejects(emptyCalendar.listActive(actors.denied.actor), (error) => error.status === 403);
	await assert.rejects(emptyOnboarding.listRoster(actors.denied.actor, 'all'), (error) => error.status === 403);
} finally {
	await vite.close();
	process.chdir(previousCwd);
}

console.log('Disposable Calendar/Onboarding lane-only Personnel RLS and live roster provider witness passed.');
