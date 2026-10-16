import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanWorkloads, expandWorkload, workloadMembers, workloads, workloadTables } from './perf-workloads.mjs';

const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'wide@example.test' };
const scoped = { id: '22222222-2222-4222-8222-222222222222', email: 'scoped@example.test' };
const expand = (name, anchor = '2026-10-15') =>
	expandWorkload(name, { anchor, owner, scoped, members: workloadMembers(name, 'run') });

test('the same workload and anchor expand to identical rows', () => {
	assert.deepEqual(expand('typical'), expand('typical'));
	assert.deepEqual(workloadMembers('large', 'run'), workloadMembers('large', 'run'));
	assert.notDeepEqual(workloadMembers('large', 'run'), workloadMembers('large', 'other'));
});

test('row counts follow the workload table', () => {
	for (const [name, shape] of Object.entries(workloads)) {
		const { rows } = expand(name);
		const active = shape.groups * shape.personnelPerGroup;
		const archived = shape.groups * Math.round((shape.personnelPerGroup * shape.archivedPercent) / 100);
		const days = shape.windowDays.past + shape.windowDays.future + 1;
		const members = Object.values(shape.members).reduce((sum, count) => sum + count, 0);
		assert.equal(rows.groups.length, shape.groups, name);
		assert.equal(rows.personnel.filter((person) => person.archived_at === null).length, active, name);
		assert.equal(rows.personnel.length, active + archived, name);
		assert.equal(
			rows.availability_entries.length,
			active * Math.round((shape.availabilityPerPersonPer30Days * days) / 30),
			name
		);
		assert.equal(rows.daily_assignments.length, shape.assignmentTypes * days, name);
		assert.equal(rows.training_types.length, shape.trainingTypes, name);
		assert.equal(rows.ict_tasks.length, shape.criticalTasks, name);
		assert.equal(rows.organization_memberships.length, 2 + members, name);
		assert.equal(rows.personnel_onboardings.length, shape.onboardingInProgress + shape.onboardingCompleted, name);
	}
	assert.deepEqual(
		Object.values(workloads).map((shape) => shape.groups * shape.personnelPerGroup),
		[20, 100, 400]
	);
});

test('rows satisfy the unique keys and references the database enforces', () => {
	const { organization, rows, window, scopedGroup } = expand('large');
	const unique = (values, label) => assert.equal(new Set(values).size, values.length, label);
	for (const table of workloadTables) {
		unique(
			rows[table].map((row) => row.id),
			table
		);
		for (const row of rows[table])
			if ('organization_id' in row) assert.equal(row.organization_id, organization.id, table);
	}
	unique(
		rows.personnel.map((person) => person.slug),
		'personnel slug'
	);
	for (const person of rows.personnel) assert.match(person.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
	unique(
		rows.daily_assignments.map((row) => `${row.assignment_type_id}:${row.date}`),
		'daily assignment slot'
	);
	unique(
		rows.personnel_trainings.map((row) => `${row.personnel_id}:${row.training_type_id}`),
		'training'
	);
	unique(
		rows.personnel_ict_completions.map((row) => `${row.personnel_id}:${row.ict_task_id}:${row.completed_at}`),
		'critical task completion'
	);
	const ids = (table) => new Set(rows[table].map((row) => row.id));
	const groups = ids('groups');
	const personnel = ids('personnel');
	for (const person of rows.personnel) assert.ok(groups.has(person.group_id));
	for (const entry of rows.availability_entries) {
		assert.ok(personnel.has(entry.personnel_id));
		assert.ok(entry.start_date >= window.start && entry.end_date <= window.end && entry.start_date <= entry.end_date);
	}
	for (const row of rows.personnel_trainings) assert.ok(personnel.has(row.personnel_id));
	for (const row of rows.personnel_ict_completions) assert.ok(personnel.has(row.personnel_id));
	const membership = (userId) => rows.organization_memberships.find((row) => row.user_id === userId);
	assert.equal(membership(owner.id).access_scope_kind, 'organization');
	assert.deepEqual(membership(scoped.id).access_scope_group_ids, [scopedGroup.id]);
});

test('the anchor moves dates without changing identities', () => {
	const now = expand('small', '2026-10-15');
	const later = expand('small', '2027-03-01');
	assert.deepEqual(
		later.rows.personnel.map((person) => person.id),
		now.rows.personnel.map((person) => person.id)
	);
	assert.deepEqual(now.window, { start: '2026-07-17', end: '2027-01-13' });
	assert.deepEqual(later.window, { start: '2026-12-01', end: '2027-05-30' });
});

test('sentinels and search terms belong to each actor scope', () => {
	const { rows, sentinels, searchTerms, scopedGroup } = expand('typical');
	const active = rows.personnel.filter((person) => person.archived_at === null);
	const label = (person) => `${person.last_name}, ${person.first_name}`;
	const inGroup = active.filter((person) => person.group_id === scopedGroup.id);
	assert.ok(inGroup.some((person) => label(person) === sentinels.scoped));
	assert.ok(active.some((person) => label(person) === sentinels.wide));
	assert.equal(inGroup.filter((person) => person.last_name === searchTerms.scoped).length, 1);
	assert.equal(active.filter((person) => person.last_name === searchTerms.wide).length, 1);
});

const journaled = () => ({
	workloads: {
		small: {
			organizationId: '33333333-3333-4333-8333-333333333333',
			users: ['44444444-4444-4444-8444-444444444444'],
			tables: [{ table: 'groups', ids: ['55555555-5555-4555-8555-555555555555'] }]
		}
	}
});

// Every row query answers as already removed; only the auth readback varies.
function provider(readback) {
	const query = { then: (resolve) => resolve({ error: null, count: 0 }) };
	for (const method of ['select', 'delete', 'eq', 'in']) query[method] = () => query;
	return {
		from: () => query,
		auth: { admin: { deleteUser: async () => ({ error: null }), getUserById: async () => readback } }
	};
}

test('an unavailable account readback fails cleanup and keeps the journal', async () => {
	const ownedState = journaled();
	const saved = [];
	await assert.rejects(
		cleanWorkloads({
			client: provider({ data: { user: null }, error: { status: 503, message: 'Service Unavailable' } }),
			ownedState,
			save: async (state) => saved.push(structuredClone(state))
		}),
		/user readback failed: Service Unavailable/
	);
	assert.deepEqual(ownedState, journaled());
	assert.deepEqual(saved, []);
});

test('an account the provider reports not found is read back as removed', async () => {
	const ownedState = journaled();
	const results = await cleanWorkloads({
		client: provider({
			data: { user: null },
			error: { status: 404, code: 'user_not_found', message: 'User not found' }
		}),
		ownedState,
		save: async () => {}
	});
	assert.equal(results.small.clean, true);
	assert.deepEqual(results.small.readback.users, { seeded: 1, remaining: 0 });
	assert.deepEqual(ownedState.workloads, {});
});
