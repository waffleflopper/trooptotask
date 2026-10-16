import { createHash } from 'node:crypto';

// One synthetic Organization per workload, sized from Robert's 20/100/400 Personnel
// decision. Proportions model a company-to-battalion military unit using the app daily:
// - Groups are platoons/sections: about 10 in a platoon-sized unit, 20 in a company
//   platoon, 25 across a battalion's many sections; nobody sits in one giant Group (#1555).
// - About a tenth of the roster is archived history (PCS, ETS, separation).
// - Availability: roughly one leave, TDY, appointment or school entry per Soldier per
//   month, lasting 1-14 days, over the stated window around the run's anchor day.
// - Daily assignments: one slot per duty type per day (staff duty, CQ, runner, details);
//   more duty types as the unit grows.
// - Training: a unit tracks 8-25 requirement types; most Soldiers are current on most of
//   them. Critical Tasks are an MOS task list; completions are partial with older history.
// - Onboarding: a steady trickle of in-processing Soldiers plus finished packets.
// - Members: the app's users are leaders and admin staff, not every Soldier.
export const workloads = {
	small: {
		groups: 2,
		personnelPerGroup: 10,
		archivedPercent: 10,
		windowDays: { past: 90, future: 90 },
		availabilityPerPersonPer30Days: 1,
		statusTypes: 4,
		assignmentTypes: 2,
		trainingTypes: 8,
		trainingCompletionPercent: 85,
		criticalTasks: 10,
		criticalTaskCompletionPercent: 60,
		criticalTaskHistoryPercent: 25,
		onboardingInProgress: 2,
		onboardingCompleted: 2,
		members: { admin: 1, member: 2 }
	},
	typical: {
		groups: 5,
		personnelPerGroup: 20,
		archivedPercent: 10,
		windowDays: { past: 90, future: 90 },
		availabilityPerPersonPer30Days: 1,
		statusTypes: 6,
		assignmentTypes: 4,
		trainingTypes: 15,
		trainingCompletionPercent: 85,
		criticalTasks: 25,
		criticalTaskCompletionPercent: 60,
		criticalTaskHistoryPercent: 25,
		onboardingInProgress: 5,
		onboardingCompleted: 10,
		members: { admin: 2, member: 8 }
	},
	large: {
		groups: 16,
		personnelPerGroup: 25,
		archivedPercent: 10,
		windowDays: { past: 90, future: 90 },
		availabilityPerPersonPer30Days: 1,
		statusTypes: 8,
		assignmentTypes: 6,
		trainingTypes: 25,
		trainingCompletionPercent: 85,
		criticalTasks: 40,
		criticalTaskCompletionPercent: 60,
		criticalTaskHistoryPercent: 25,
		onboardingInProgress: 20,
		onboardingCompleted: 40,
		members: { admin: 4, member: 30 }
	}
};

// Rows are inserted in this order and deleted in reverse.
export const workloadTables = [
	'organization_rank_catalog',
	'groups',
	'organization_memberships',
	'status_types',
	'assignment_types',
	'training_types',
	'ict_tasks',
	'onboarding_templates',
	'onboarding_template_steps',
	'personnel',
	'availability_entries',
	'daily_assignments',
	'personnel_trainings',
	'personnel_ict_completions',
	'personnel_onboardings',
	'onboarding_step_progress'
];

const ranks = [
	['PVT', 'Private', 'E-1', 'enlisted', 2],
	['PFC', 'Private First Class', 'E-3', 'enlisted', 10],
	['SPC', 'Specialist', 'E-4', 'enlisted', 30],
	['SGT', 'Sergeant', 'E-5', 'enlisted', 20],
	['SSG', 'Staff Sergeant', 'E-6', 'enlisted', 14],
	['SFC', 'Sergeant First Class', 'E-7', 'enlisted', 8],
	['1SG', 'First Sergeant', 'E-8', 'enlisted', 1],
	['2LT', 'Second Lieutenant', 'O-1', 'officer', 4],
	['1LT', 'First Lieutenant', 'O-2', 'officer', 4],
	['CPT', 'Captain', 'O-3', 'officer', 3]
];
const mosCodes = ['11B', '68W', '25U', '92Y', '88M', '42A'];
const roles = ['', 'Medic', 'NCO', 'Driver', 'Team Leader'];
const lastNames = [
	'Adams',
	'Baker',
	'Carter',
	'Diaz',
	'Evans',
	'Foster',
	'Garcia',
	'Hughes',
	'Irwin',
	'Jensen',
	'Kim',
	'Lopez',
	'Moore',
	'Nguyen',
	'Ortiz',
	'Patel',
	'Quinn',
	'Reyes',
	'Smith',
	'Turner',
	'Usher',
	'Vance',
	'Walsh',
	'Xu',
	'Young',
	'Zimmer'
];
const firstNames = ['Alex', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Jordan', 'Kai'];
const groupNames = [
	'Alpha',
	'Bravo',
	'Charlie',
	'Delta',
	'Echo',
	'Foxtrot',
	'Golf',
	'Hotel',
	'India',
	'Juliet',
	'Kilo',
	'Lima',
	'Mike',
	'November',
	'Oscar',
	'Papa'
];

function random(seed) {
	let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function uuidFrom(next) {
	const bytes = Array.from({ length: 16 }, () => Math.floor(next() * 256));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function addDays(anchor, offset) {
	const value = new Date(`${anchor}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + offset);
	return value.toISOString().slice(0, 10);
}

function addMonths(date, months) {
	const value = new Date(`${date}T00:00:00Z`);
	const day = value.getUTCDate();
	value.setUTCDate(1);
	value.setUTCMonth(value.getUTCMonth() + months);
	const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
	value.setUTCDate(Math.min(day, last));
	return value.toISOString().slice(0, 10);
}

/**
 * Every row of one workload, deterministic for a name and anchor day. The anchor is
 * the run's local day, so a later run keeps the same shape relative to "today".
 */
export function expandWorkload(name, { anchor, owner, scoped, members }) {
	const shape = workloads[name];
	if (!shape) throw new Error(`Unknown workload ${name}; use ${Object.keys(workloads).join(', ')}.`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error('Workload anchor must be YYYY-MM-DD.');
	const next = random(`t2t-perf-workload:${name}`);
	const id = () => uuidFrom(next);
	const pick = (list) => list[Math.floor(next() * list.length)];
	const between = (low, high) => low + Math.floor(next() * (high - low + 1));
	const chance = (percent) => next() * 100 < percent;
	const weighted = (() => {
		const total = ranks.reduce((sum, rank) => sum + rank[4], 0);
		return () => {
			let roll = next() * total;
			for (const rank of ranks) if ((roll -= rank[4]) < 0) return rank[0];
			return ranks.at(-1)[0];
		};
	})();
	const organizationId = id();
	const inOrganization = (row) => ({ ...row, organization_id: organizationId });
	const rows = Object.fromEntries(workloadTables.map((table) => [table, []]));

	rows.organization_rank_catalog = ranks.map(([code, label, payGrade, category], index) =>
		inOrganization({
			id: id(),
			code,
			label,
			pay_grade: payGrade,
			service: 'army',
			category,
			state: 'active',
			source: 'built-in',
			sort_order: index + 1
		})
	);
	rows.groups = groupNames
		.slice(0, shape.groups)
		.map((groupName, index) => inOrganization({ id: id(), name: groupName, sort_order: index }));
	const scopedGroup = rows.groups[0];

	const capabilities = (level) =>
		Object.fromEntries(
			['personnel', 'calendar', 'training', 'criticalTasks', 'onboarding', 'ratingScheme'].map((lane) => [lane, level])
		);
	rows.organization_memberships = [
		{ user: owner, role: 'owner', scope: 'organization' },
		{ user: scoped, role: 'member', scope: 'groups' },
		...members.map((member) => ({ user: member, role: member.role, scope: 'organization' }))
	].map(({ user, role, scope }) =>
		inOrganization({
			id: id(),
			user_id: user.id,
			email: user.email,
			role,
			member_preset: role === 'member' ? 'operator' : 'editor',
			capability_overrides: capabilities(role === 'member' ? 'operate' : 'configure'),
			access_scope_kind: scope,
			access_scope_group_ids: scope === 'groups' ? [scopedGroup.id] : []
		})
	);

	const palette = ['#166534', '#1d4ed8', '#7c2d12', '#7e22ce', '#0f766e', '#b45309', '#be123c', '#4d7c0f'];
	rows.status_types = ['Leave', 'TDY', 'Appointment', 'School', 'Sick Call', 'Field', 'Pass', 'Quarters']
		.slice(0, shape.statusTypes)
		.map((statusName, index) =>
			inOrganization({ id: id(), name: statusName, color: palette[index], text_color: '#ffffff', sort_order: index })
		);
	rows.assignment_types = [
		['Staff Duty', 'SD', 'personnel'],
		['CQ', 'CQ', 'personnel'],
		['Runner', 'RUN', 'personnel'],
		['Detail Group', 'DET', 'group'],
		['Range Safety', 'RSO', 'personnel'],
		['Motor Pool', 'MP', 'group']
	]
		.slice(0, shape.assignmentTypes)
		.map(([typeName, shortName, assignTo], index) =>
			inOrganization({
				id: id(),
				name: typeName,
				short_name: shortName,
				assign_to: assignTo,
				color: palette[index],
				sort_order: index,
				exempt_personnel_ids: [],
				show_in_date_header: index === 0
			})
		);
	rows.training_types = Array.from({ length: shape.trainingTypes }, (_, index) =>
		inOrganization({
			id: id(),
			name: `Workload Training ${String(index + 1).padStart(2, '0')}`,
			description: null,
			expiration_months: [12, 12, 24, 36, null][index % 5],
			warning_days_yellow: 60,
			warning_days_orange: 30,
			applies_to_roles: [],
			applies_to_mos: index % 6 === 5 ? ['68W'] : [],
			applies_to_ranks: [],
			excluded_roles: [],
			excluded_mos: [],
			excluded_ranks: [],
			color: palette[index % palette.length],
			sort_order: index,
			expiration_date_only: false,
			can_be_exempted: false,
			exempt_personnel_ids: [],
			is_optional: index % 10 === 9
		})
	);
	rows.ict_tasks = Array.from({ length: shape.criticalTasks }, (_, index) =>
		inOrganization({
			id: id(),
			task_code: `WL-${String(index + 1).padStart(3, '0')}`,
			title: `Workload Critical Task ${String(index + 1).padStart(3, '0')}`,
			category: ['Clinical', 'Tactical', 'Administrative'][index % 3],
			mos: index % 4 === 0 ? [pick(mosCodes)] : [],
			expiration_months: 12,
			sort_order: index
		})
	);
	const template = inOrganization({
		id: id(),
		name: 'Workload In-processing',
		description: 'Synthetic workload template'
	});
	rows.onboarding_templates = [template];
	rows.onboarding_template_steps = [
		['Unit orientation', 'checkbox'],
		['Housing briefing', 'checkbox'],
		['Finance in-processing', 'paperwork'],
		['Records review', 'paperwork'],
		['Equipment issue', 'checkbox'],
		['Required training', 'training']
	].map(([stepName, stepType], index) =>
		inOrganization({
			id: id(),
			template_id: template.id,
			name: stepName,
			description: null,
			step_type: stepType,
			training_type_id: stepType === 'training' ? rows.training_types[0].id : null,
			stages: stepType === 'paperwork' ? ['Submitted', 'Reviewed', 'Filed'] : null,
			sort_order: index
		})
	);

	const people = [];
	const archivedPerGroup = Math.round((shape.personnelPerGroup * shape.archivedPercent) / 100);
	for (const group of rows.groups)
		for (let index = 0; index < shape.personnelPerGroup + archivedPerGroup; index++) {
			const last = `${lastNames[people.length % lastNames.length]}${String(people.length + 1).padStart(3, '0')}`;
			const first = firstNames[people.length % firstNames.length];
			const archived = index >= shape.personnelPerGroup;
			people.push(
				inOrganization({
					id: id(),
					group_id: group.id,
					first_name: first,
					last_name: last,
					rank: weighted(),
					mos: pick(mosCodes),
					clinic_role: pick(roles),
					slug: `${last.toLowerCase()}-${first.toLowerCase()}`,
					ets: addDays(anchor, between(-30, 900)),
					deros: chance(30) ? addDays(anchor, between(0, 720)) : null,
					archived_at: archived ? `${addDays(anchor, -between(30, 700))}T12:00:00Z` : null
				})
			);
		}
	rows.personnel = people;
	const active = people.filter((person) => person.archived_at === null);

	const windowLength = shape.windowDays.past + shape.windowDays.future + 1;
	const entriesPerPerson = Math.round((shape.availabilityPerPersonPer30Days * windowLength) / 30);
	for (const person of active)
		for (let entry = 0; entry < entriesPerPerson; entry++) {
			const start = between(-shape.windowDays.past, shape.windowDays.future);
			const end = Math.min(start + between(0, 13), shape.windowDays.future);
			rows.availability_entries.push(
				inOrganization({
					id: id(),
					personnel_id: person.id,
					status_type_id: pick(rows.status_types).id,
					start_date: addDays(anchor, start),
					end_date: addDays(anchor, end),
					note: chance(20) ? 'Synthetic workload note' : null
				})
			);
		}
	for (const type of rows.assignment_types)
		for (let offset = -shape.windowDays.past; offset <= shape.windowDays.future; offset++)
			rows.daily_assignments.push(
				inOrganization({
					id: id(),
					assignment_type_id: type.id,
					date: addDays(anchor, offset),
					assignee_id: type.assign_to === 'group' ? pick(rows.groups).id : pick(active).id
				})
			);

	for (const person of people)
		for (const type of rows.training_types) {
			if (!chance(shape.trainingCompletionPercent)) continue;
			const completion = addDays(anchor, -between(1, 420));
			rows.personnel_trainings.push(
				inOrganization({
					id: id(),
					personnel_id: person.id,
					training_type_id: type.id,
					completion_date: completion,
					expiration_date: type.expiration_months ? addMonths(completion, type.expiration_months) : null
				})
			);
		}
	for (const person of people)
		for (const task of rows.ict_tasks) {
			if (!chance(shape.criticalTaskCompletionPercent)) continue;
			const latest = between(1, 360);
			const dates = [latest, ...(chance(shape.criticalTaskHistoryPercent) ? [latest + between(366, 700)] : [])];
			for (const daysAgo of dates)
				rows.personnel_ict_completions.push(
					inOrganization({
						id: id(),
						personnel_id: person.id,
						ict_task_id: task.id,
						completed_at: addDays(anchor, -daysAgo),
						validation_method: pick(['Demonstration', 'Practical Exercise', 'Lecture']),
						logged_by: owner.id
					})
				);
		}

	const arrivals = active.slice(-(shape.onboardingInProgress + shape.onboardingCompleted));
	arrivals.forEach((person, index) => {
		const inProgress = index >= shape.onboardingCompleted;
		const started = addDays(anchor, inProgress ? -between(0, 30) : -between(60, 300));
		const packet = inOrganization({
			id: id(),
			personnel_id: person.id,
			template_id: template.id,
			started_at: started,
			completed_at: inProgress ? null : addDays(started, between(7, 45)),
			status: inProgress ? 'in_progress' : 'completed'
		});
		rows.personnel_onboardings.push(packet);
		for (const step of rows.onboarding_template_steps) {
			const completed = !inProgress || chance(50);
			rows.onboarding_step_progress.push(
				inOrganization({
					id: id(),
					onboarding_id: packet.id,
					template_step_id: step.id,
					step_name: step.name,
					step_type: step.step_type,
					training_type_id: step.training_type_id,
					stages: step.stages,
					sort_order: step.sort_order,
					completed,
					current_stage: step.step_type === 'paperwork' && completed ? 'Filed' : null,
					notes: [],
					active: true
				})
			);
		}
	});

	const label = (person) => `${person.last_name}, ${person.first_name}`;
	const scopedPeople = active.filter((person) => person.group_id === scopedGroup.id);
	return {
		organization: {
			id: organizationId,
			name: `Performance Workload ${name[0].toUpperCase()}${name.slice(1)}`,
			created_by: owner.id
		},
		rows,
		scopedGroup: { id: scopedGroup.id, name: scopedGroup.name },
		// The alphabetically last active name each actor can see; its rendering marks a full roster.
		sentinels: {
			wide: label(active.toSorted((a, b) => label(a).localeCompare(label(b))).at(-1)),
			scoped: label(scopedPeople.toSorted((a, b) => label(a).localeCompare(label(b))).at(-1))
		},
		// A unique last name in each actor's scope; searching it leaves one row.
		searchTerms: {
			wide: active[Math.floor(active.length / 2)].last_name,
			scoped: scopedPeople[Math.floor(scopedPeople.length / 2)].last_name
		},
		window: { start: addDays(anchor, -shape.windowDays.past), end: addDays(anchor, shape.windowDays.future) }
	};
}

/** Synthetic member accounts beyond the two fixture actors. IDs are journaled before creation. */
export function workloadMembers(name, tag) {
	const shape = workloads[name];
	const next = random(`t2t-perf-members:${name}:${tag}`);
	return Object.entries(shape.members).flatMap(([role, count]) =>
		Array.from({ length: count }, (_, index) => ({
			id: uuidFrom(next),
			role,
			email: `perf-${name}-${role}-${index + 1}-${tag}@example.test`
		}))
	);
}

async function timed(work) {
	const started = performance.now();
	await work();
	return Math.round(performance.now() - started);
}

export async function seedWorkload({ client, fixture, name, tag, ownedState, save }) {
	ownedState.workloads ??= {};
	if (ownedState.workloads[name]) throw new Error(`Clean the existing ${name} workload before seeding it again.`);
	const owner = fixture.actors.perfWide;
	const scoped = fixture.actors.perfScoped;
	if (!owner || !scoped) throw new Error('This worker predates the performance actors; restart it.');
	const members = workloadMembers(name, tag);
	const expanded = expandWorkload(name, { anchor: fixture.dates.ui, owner, scoped, members });
	const { organization, rows } = expanded;
	ownedState.workloads[name] = {
		tag,
		organizationId: organization.id,
		anchor: fixture.dates.ui,
		users: members.map((member) => member.id),
		tables: workloadTables.map((table) => ({ table, ids: rows[table].map((row) => row.id) })),
		scopedGroup: expanded.scopedGroup,
		sentinels: expanded.sentinels,
		searchTerms: expanded.searchTerms,
		window: expanded.window,
		name: organization.name
	};
	await save(ownedState);
	const timings = {};
	timings.users = await timed(async () => {
		for (const member of members) {
			const { error } = await client.auth.admin.createUser({
				id: member.id,
				email: member.email,
				email_confirm: true
			});
			if (error) throw new Error(`Disposable provider user creation failed: ${error.message}`);
		}
	});
	timings.organizations = await timed(async () => {
		const { error } = await client.from('organizations').insert(organization);
		if (error) throw new Error(`Disposable provider operation failed: ${error.message}`);
	});
	for (const table of workloadTables)
		timings[table] = await timed(async () => {
			for (let offset = 0; offset < rows[table].length; offset += 500) {
				const { error } = await client.from(table).insert(rows[table].slice(offset, offset + 500));
				if (error) throw new Error(`Disposable provider operation failed on ${table}: ${error.message}`);
			}
		});
	return {
		workload: name,
		tag,
		anchor: fixture.dates.ui,
		organizationId: organization.id,
		organizationName: organization.name,
		shape: workloads[name],
		counts: Object.fromEntries(workloadTables.map((table) => [table, rows[table].length])),
		activePersonnel: rows.personnel.filter((person) => person.archived_at === null).length,
		window: expanded.window,
		actors: {
			perfWide: { role: 'owner', scope: 'organization' },
			perfScoped: { role: 'member', scope: 'groups', group: expanded.scopedGroup.name }
		},
		sentinels: expanded.sentinels,
		searchTerms: expanded.searchTerms,
		timingsMs: { ...timings, total: Object.values(timings).reduce((sum, value) => sum + value, 0) }
	};
}

// Rows the app itself may write while a workload is driven. Organization deletion cascades all
// of them except audit_logs, whose org_id is ON DELETE SET NULL, so those rows survive it and
// are removed by ID first.
const appWrittenTables = [
	['user_org_preferences', 'organization_id'],
	['user_pinned_groups', 'organization_id'],
	['getting_started_progress', 'organization_id'],
	['dashboard_configs', 'org_id'],
	['notifications', 'organization_id'],
	['audit_logs', 'org_id']
];
const survivingTables = ['audit_logs'];

/** The provider reports an absent account as a 404, with or without the `user_not_found` code. */
export const accountAbsent = (error) => error?.status === 404 || error?.code === 'user_not_found';

async function count(client, table, column, value) {
	const { count: total, error } = await client
		.from(table)
		.select('*', { count: 'exact', head: true })
		.eq(column, value);
	if (error) throw new Error(`Disposable provider readback failed on ${table}: ${error.message}`);
	return total;
}

async function idsFor(client, table, column, value) {
	const ids = [];
	for (;;) {
		const { data, error } = await client
			.from(table)
			.select('id')
			.eq(column, value)
			.order('id')
			.range(ids.length, ids.length + 999);
		if (error) throw new Error(`Disposable provider readback failed on ${table}: ${error.message}`);
		ids.push(...data.map((row) => row.id));
		if (data.length < 1000) return ids;
	}
}

async function idsRemaining(client, table, ids) {
	const found = [];
	for (let offset = 0; offset < ids.length; offset += 200) {
		const { data, error } = await client
			.from(table)
			.select('id')
			.in('id', ids.slice(offset, offset + 200));
		if (error) throw new Error(`Disposable provider readback failed on ${table}: ${error.message}`);
		found.push(...data.map((row) => row.id));
	}
	return found;
}

/** Journals the IDs of app-written rows (merged across interrupted runs) before anything is deleted. */
async function captureAppWritten(client, item, ownedState, save) {
	item.appWritten ??= {};
	for (const [table, column] of appWrittenTables) {
		const known = new Set(item.appWritten[table] ?? []);
		for (const id of await idsFor(client, table, column, item.organizationId)) known.add(id);
		item.appWritten[table] = [...known];
	}
	await save(ownedState);
}

/** Deletes exactly the journaled rows and accounts, then reads every one of them back. */
export async function cleanWorkloads({ client, ownedState, save }) {
	const results = {};
	for (const [name, item] of Object.entries(ownedState.workloads ?? {})) {
		await captureAppWritten(client, item, ownedState, save);
		for (const { table, ids } of [...item.tables].reverse())
			for (let offset = 0; offset < ids.length; offset += 200) {
				const { error } = await client
					.from(table)
					.delete()
					.eq('organization_id', item.organizationId)
					.in('id', ids.slice(offset, offset + 200));
				if (error) throw new Error(`Disposable provider cleanup failed on ${table}: ${error.message}`);
			}
		for (const table of survivingTables)
			for (let offset = 0; offset < item.appWritten[table].length; offset += 200) {
				const { error } = await client
					.from(table)
					.delete()
					.in('id', item.appWritten[table].slice(offset, offset + 200));
				if (error) throw new Error(`Disposable provider cleanup failed on ${table}: ${error.message}`);
			}
		const { error } = await client.from('organizations').delete().eq('id', item.organizationId);
		if (error) throw new Error(`Disposable provider cleanup failed on organizations: ${error.message}`);
		for (const userId of item.users) {
			const { error: userError } = await client.auth.admin.deleteUser(userId);
			if (userError && !accountAbsent(userError))
				throw new Error(`Disposable provider user cleanup failed: ${userError.message}`);
		}
		const remaining = {};
		for (const { table, ids } of item.tables) {
			let found = 0;
			for (let offset = 0; offset < ids.length; offset += 200) {
				const { count: total, error: readError } = await client
					.from(table)
					.select('*', { count: 'exact', head: true })
					.in('id', ids.slice(offset, offset + 200));
				if (readError) throw new Error(`Disposable provider readback failed on ${table}: ${readError.message}`);
				found += total;
			}
			remaining[table] = { seeded: ids.length, remaining: found };
		}
		remaining.organizations = { seeded: 1, remaining: await count(client, 'organizations', 'id', item.organizationId) };
		let usersRemaining = 0;
		for (const userId of item.users) {
			const { data, error: readError } = await client.auth.admin.getUserById(userId);
			if (accountAbsent(readError)) continue;
			if (readError) throw new Error(`Disposable provider user readback failed: ${readError.message}`);
			if (data?.user) usersRemaining++;
		}
		remaining.users = { seeded: item.users.length, remaining: usersRemaining };
		for (const [table, ids] of Object.entries(item.appWritten)) {
			const left = await idsRemaining(client, table, ids);
			remaining[`app.${table}`] = { seeded: ids.length, remaining: left.length, ...(left.length ? { ids: left } : {}) };
		}
		const clean = Object.values(remaining).every((entry) => entry.remaining === 0);
		results[name] = { organizationId: item.organizationId, clean, readback: remaining };
		if (!clean) throw new Error(`Workload ${name} cleanup left rows: ${JSON.stringify(remaining)}`);
		delete ownedState.workloads[name];
		await save(ownedState);
	}
	return results;
}
