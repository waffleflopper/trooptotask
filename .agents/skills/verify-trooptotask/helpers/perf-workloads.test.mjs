import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	cleanWorkloads,
	expandWorkload,
	federalHolidays,
	importCsv,
	removeImported,
	workloadMembers,
	workloadTables
} from './perf-workloads.mjs';

const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'wide@example.test' };
const scoped = { id: '22222222-2222-4222-8222-222222222222', email: 'scoped@example.test' };
const scopedLeader = { id: '33333333-3333-4333-8333-333333333333', email: 'leader@example.test' };
const expand = (name, anchor = '2026-10-15') =>
	expandWorkload(name, { anchor, owner, scoped, scopedLeader, members: workloadMembers(name, 'run') });

test('the same workload and anchor expand to identical rows', () => {
	assert.deepEqual(expand('typical'), expand('typical'));
	assert.deepEqual(workloadMembers('large', 'run'), workloadMembers('large', 'run'));
	assert.notDeepEqual(workloadMembers('large', 'run'), workloadMembers('large', 'other'));
});

// Robert's 20/100/400 active People, 10% archived per Group (rounded half up), one
// availability entry per active Person per 30 days over 181 days (6), and one assignment per
// duty type for each of the 181 days.
test('each approved workload expands to its specified row counts', () => {
	const expected = {
		small: {
			groups: 2,
			active: 20,
			archived: 2,
			availability: 120,
			assignments: 362,
			training: 8,
			tasks: 10,
			memberships: 6,
			onboarding: 4
		},
		typical: {
			groups: 5,
			active: 100,
			archived: 10,
			availability: 600,
			assignments: 724,
			training: 15,
			tasks: 25,
			memberships: 13,
			onboarding: 15
		},
		large: {
			groups: 16,
			active: 400,
			archived: 48,
			availability: 2400,
			assignments: 1086,
			training: 25,
			tasks: 40,
			memberships: 37,
			onboarding: 60
		}
	};
	for (const [name, counts] of Object.entries(expected)) {
		const { rows } = expand(name);
		const active = rows.personnel.filter((person) => person.archived_at === null).length;
		assert.deepEqual(
			{
				groups: rows.groups.length,
				active,
				archived: rows.personnel.length - active,
				availability: rows.availability_entries.length,
				assignments: rows.daily_assignments.length,
				training: rows.training_types.length,
				tasks: rows.ict_tasks.length,
				memberships: rows.organization_memberships.length,
				onboarding: rows.personnel_onboardings.length
			},
			counts,
			name
		);
	}
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
	assert.equal(membership(scopedLeader.id).member_preset, 'editor');
	assert.equal(membership(scopedLeader.id).capability_overrides.personnel, 'configure');
	assert.deepEqual(membership(scopedLeader.id).access_scope_group_ids, [scopedGroup.id]);
});

test('adding the scoped editor leaves every row seeded before it unchanged', () => {
	// The last Person generated in the large workload before the editor membership existed.
	assert.equal(expand('large').rows.personnel.at(-1).id, '419db40b-45c1-42a3-84e0-ba4b3ead9e45');
});

// 2026 observed dates: Independence Day falls on a Saturday and is observed Friday July 3.
test('federal holidays follow the observed US calendar', () => {
	assert.deepEqual(
		federalHolidays(2026).map((day) => day.date),
		[
			'2026-01-01',
			'2026-01-19',
			'2026-02-16',
			'2026-05-25',
			'2026-06-19',
			'2026-07-03',
			'2026-09-07',
			'2026-10-12',
			'2026-11-11',
			'2026-11-26',
			'2026-12-25'
		]
	);
});

// 44 federal holidays over 2025-2028; a training holiday beside each of the 31 that fall on a
// Monday or Thursday; ten block-leave weekdays from December 22, of which 4, 2, 2 and 2 already
// hold a holiday. The window around 2026-10-15 holds 17 of them.
test('every workload has the same Calendar days, lanes on its watched duties and short status labels', () => {
	for (const [name, lanes] of [
		['small', ['Staff Duty', 'CQ']],
		['typical', ['Staff Duty', 'CQ', 'Runner']],
		['large', ['Staff Duty', 'CQ', 'Runner', 'Detail Group']]
	]) {
		const { rows, window } = expand(name);
		const days = rows.special_days;
		assert.equal(new Set(days.map((day) => day.date)).size, days.length, name);
		assert.deepEqual(
			{
				federal: days.filter((day) => day.type === 'federal-holiday').length,
				training: days.filter((day) => day.name === 'Training holiday').length,
				blockLeave: days.filter((day) => day.name === 'Holiday block leave').length,
				inWindow: days.filter((day) => day.date >= window.start && day.date <= window.end).length
			},
			{ federal: 44, training: 31, blockLeave: 30, inWindow: 17 },
			name
		);
		assert.deepEqual(
			rows.assignment_types.filter((type) => type.show_on_calendar).map((type) => type.name),
			lanes
		);
		assert.ok(
			rows.status_types.every((type) => /^[A-Z]{2,3}$/.test(type.short_label)),
			name
		);
	}
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

const organizationId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const groupId = '55555555-5555-4555-8555-555555555555';
const auditId = '66666666-6666-4666-8666-666666666666';

const journaled = () => ({
	workloads: {
		small: { organizationId, users: [userId], tables: [{ table: 'groups', ids: [groupId] }] }
	}
});

// An in-memory provider with the schema's delete actions: deleting an Organization cascades its
// rows, except audit_logs, whose org_id is set to null. `keepAudit` models rows that refuse deletion.
function provider({
	readback = { data: { user: null }, error: null },
	deleted = { error: null },
	keepAudit = false
} = {}) {
	const tables = {
		groups: [{ id: groupId, organization_id: organizationId }],
		organizations: [{ id: organizationId }],
		dashboard_configs: [{ id: 'cfg', org_id: organizationId }],
		audit_logs: [{ id: auditId, org_id: organizationId }]
	};
	const queryOn = (table) => {
		const filters = [];
		let deleting = false;
		let head = false;
		let window = null;
		const matches = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
		const query = {
			select: (_columns, options = {}) => ((head = options.head === true), query),
			delete: () => ((deleting = true), query),
			eq: (column, value) => (filters.push((row) => row[column] === value), query),
			in: (column, values) => (filters.push((row) => values.includes(row[column])), query),
			order: () => query,
			range: (from, to) => ((window = [from, to + 1]), query),
			then(resolve) {
				const rows = matches();
				if (!deleting) {
					const page = window ? rows.slice(...window) : rows;
					return resolve(head ? { error: null, count: rows.length } : { error: null, data: page });
				}
				if (table === 'audit_logs' && keepAudit) return resolve({ error: null });
				tables[table] = tables[table].filter((row) => !rows.includes(row));
				if (table === 'organizations')
					for (const [other, list] of Object.entries(tables))
						if (other === 'audit_logs')
							for (const row of list) row.org_id = rows.some((gone) => gone.id === row.org_id) ? null : row.org_id;
						else
							tables[other] = list.filter(
								(row) => !rows.some((gone) => [row.organization_id, row.org_id].includes(gone.id))
							);
				return resolve({ error: null });
			}
		};
		return query;
	};
	return {
		tables,
		from: queryOn,
		auth: { admin: { deleteUser: async () => deleted, getUserById: async () => readback } }
	};
}

test('an unavailable account readback fails cleanup and keeps the journal', async () => {
	const ownedState = journaled();
	await assert.rejects(
		cleanWorkloads({
			client: provider({ readback: { data: { user: null }, error: { status: 503, message: 'Service Unavailable' } } }),
			ownedState,
			save: async () => {}
		}),
		/user readback failed: Service Unavailable/
	);
	assert.ok(ownedState.workloads.small);
});

test('an account the provider reports not found is read back as removed', async () => {
	const ownedState = journaled();
	const results = await cleanWorkloads({
		client: provider({
			readback: { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } }
		}),
		ownedState,
		save: async () => {}
	});
	assert.equal(results.small.clean, true);
	assert.deepEqual(results.small.readback.users, { seeded: 1, remaining: 0 });
	assert.deepEqual(ownedState.workloads, {});
});

test('an audit row the app wrote is removed by ID and read back, though the Organization delete would orphan it', async () => {
	const ownedState = journaled();
	const client = provider();
	const results = await cleanWorkloads({ client, ownedState, save: async () => {} });
	assert.equal(results.small.clean, true);
	assert.deepEqual(results.small.readback['app.audit_logs'], { seeded: 1, remaining: 0 });
	assert.deepEqual(results.small.readback['app.dashboard_configs'], { seeded: 1, remaining: 0 });
	assert.deepEqual(client.tables.audit_logs, []);
	assert.deepEqual(ownedState.workloads, {});
});

test('an audit row that cannot be removed fails cleanup with its ID and keeps the journal', async () => {
	const ownedState = journaled();
	await assert.rejects(
		cleanWorkloads({ client: provider({ keepAudit: true }), ownedState, save: async () => {} }),
		new RegExp(`"app.audit_logs":\\{"seeded":1,"remaining":1,"ids":\\["${auditId}"\\]\\}`)
	);
	assert.deepEqual(ownedState.workloads.small.appWritten.audit_logs, [auditId]);
});

test('audit rows journaled by an interrupted run are still removed after their Organization is gone', async () => {
	const ownedState = journaled();
	ownedState.workloads.small.appWritten = { audit_logs: [auditId] };
	const client = provider();
	client.tables.organizations = [];
	client.tables.dashboard_configs = [];
	client.tables.audit_logs[0].org_id = null;
	const results = await cleanWorkloads({ client, ownedState, save: async () => {} });
	assert.equal(results.small.clean, true);
	assert.deepEqual(client.tables.audit_logs, []);
});

test('one rule reads an absent account in both the delete and the readback', async () => {
	for (const absent of [{ status: 404 }, { code: 'user_not_found' }, { status: 404, code: 'user_not_found' }]) {
		const ownedState = journaled();
		const results = await cleanWorkloads({
			client: provider({ deleted: { error: absent }, readback: { data: { user: null }, error: absent } }),
			ownedState,
			save: async () => {}
		});
		assert.deepEqual(results.small.readback.users, { seeded: 1, remaining: 0 });
	}
	await assert.rejects(
		cleanWorkloads({
			client: provider({ deleted: { error: { status: 500, message: 'Boom' } } }),
			ownedState: journaled(),
			save: async () => {}
		}),
		/user cleanup failed: Boom/
	);
});

test('the import file is a quarter of the active roster, all into the scoped Group', () => {
	assert.deepEqual(
		['small', 'typical', 'large'].map((name) => importCsv(name, '2026-10-16').rows),
		[5, 25, 100]
	);
	const lines = importCsv('small', '2026-10-16').text.trim().split('\n');
	assert.equal(lines.length, 6);
	assert.equal(lines[0], 'Rank,Last Name,First Name,MOS,Duty Role,Group,ETS,PCS / DEROS');
	assert.ok(lines.slice(1).every((line) => line.split(',')[5] === 'Alpha'));
	assert.deepEqual(
		lines.slice(1).map((line) => line.split(',')[1]),
		['Arrival001', 'Arrival002', 'Arrival003', 'Arrival004', 'Arrival005']
	);
});

// The names the seeded small workload's Duty planner showed for this slot on 2026-10-17.
test('the assignment slot is named as the Duty planner names it', () => {
	assert.deepEqual(expand('small', '2026-10-17').journeyTerms.assignment, {
		control: 'Staff Duty, Thu 1 Oct: ',
		original: { label: 'SGT Irwin009, Jordan', search: 'Irwin009' },
		alternate: { label: '2LT Adams001, Alex', search: 'Adams001' }
	});
	assert.match(
		expand('small', '2026-09-15').journeyTerms.assignment.control,
		/^[A-Za-z ]+, [A-Z][a-z]{2} \d{1,2} Sept: $/
	);
});

test('journey terms count each scope and every membership', () => {
	const { journeyTerms } = expand('small');
	assert.deepEqual(journeyTerms.population, { wide: 20, scoped: 10 });
	assert.equal(journeyTerms.members, 6);
	assert.deepEqual(journeyTerms.filter, { term: '68W', rows: { wide: 3, scoped: 1 } });
});

test('each detail target names the seeded Person its row opens', () => {
	const { rows, journeyTerms } = expand('small');
	for (const target of Object.values(journeyTerms.edit)) {
		const person = rows.personnel.find((row) => row.slug === target.slug);
		assert.equal(target.row, `Open ${person.rank} ${person.last_name}, ${person.first_name}`);
		assert.equal(person.archived_at, null);
	}
});

test('imported People are journaled, removed and read back, and seeded People stay', async () => {
	const ownedState = journaled();
	ownedState.workloads.small.tables.push({ table: 'personnel', ids: ['seeded-1'] });
	const client = provider();
	client.tables.personnel = ['seeded-1', 'imported-1', 'imported-2'].map((id) => ({
		id,
		organization_id: organizationId
	}));
	const saves = [];
	const result = await removeImported({
		client,
		ownedState,
		save: async (state) => saves.push(structuredClone(state)),
		workload: 'small'
	});
	assert.deepEqual(result, { removed: 2 });
	assert.deepEqual(
		client.tables.personnel.map((row) => row.id),
		['seeded-1']
	);
	assert.deepEqual(saves[0].workloads.small.appWritten.personnel, ['imported-1', 'imported-2']);
});

test('an imported Person that survives the delete fails the sample with its ID', async () => {
	const ownedState = journaled();
	ownedState.workloads.small.tables.push({ table: 'personnel', ids: [] });
	const client = provider();
	client.tables.personnel = [{ id: 'imported-1', organization_id: organizationId }];
	const stubborn = client.from;
	client.from = (table) => {
		const query = stubborn(table);
		const remove = query.delete;
		query.delete = () => (remove(), { eq: () => ({ in: async () => ({ error: null }) }) });
		return query;
	};
	await assert.rejects(removeImported({ client, ownedState, save: async () => {}, workload: 'small' }), {
		message: 'Imported People remain: imported-1'
	});
});
