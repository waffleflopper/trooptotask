import { createHash } from 'node:crypto';

// One synthetic Organization per workload, sized from Robert's 20/100/400 Personnel
// decision. Proportions model a company-to-battalion military unit using the app daily:
// - Groups are platoons/sections: about 10 in a platoon-sized unit, 20 in a company
//   platoon, 25 across a battalion's many sections; nobody sits in one giant Group (#1555).
// - About a tenth of the roster is archived history (PCS, ETS, separation).
// - Availability: roughly one leave, TDY, appointment or school entry per Soldier per
//   month, lasting 1-14 days, over the stated window around the run's anchor day.
// - Daily assignments: one slot per duty type per day (staff duty, CQ, runner, details);
//   more duty types as the unit grows. The duties the whole unit watches are Calendar lanes
//   (`calendarLanes`); range safety and motor pool stay planner-only.
// - Status types carry the short label a one-day Calendar bar shows.
// - Special days: an Organization the app creates starts with four years of federal
//   holidays. Army units add a training holiday beside each Monday or Thursday holiday (a
//   four-day weekend) and ten weekdays of winter block leave. The calendar does not grow
//   with the roster, so every workload has the same days.
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
		calendarLanes: 2,
		specialDays: { federalHolidayYears: 4, trainingHolidays: true, blockLeaveWeekdays: 10 },
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
		calendarLanes: 3,
		specialDays: { federalHolidayYears: 4, trainingHolidays: true, blockLeaveWeekdays: 10 },
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
		calendarLanes: 4,
		specialDays: { federalHolidayYears: 4, trainingHolidays: true, blockLeaveWeekdays: 10 },
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
	'special_days',
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

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const nthWeekday = (year, month, day, n) => {
	const first = `${year}-${String(month).padStart(2, '0')}-01`;
	return addDays(first, ((day - weekday(first) + 7) % 7) + (n - 1) * 7);
};
const lastWeekday = (year, month, day) => {
	const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
	return addDays(last, -((weekday(last) - day + 7) % 7));
};
// A Saturday holiday is observed on Friday and a Sunday one on Monday.
const observed = (date) => addDays(date, { 0: 1, 6: -1 }[weekday(date)] ?? 0);

/** The observed US federal holidays of a year, the rules the app seeds a new Organization with. */
export function federalHolidays(year) {
	const fixed = (month, day) => observed(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
	return [
		["New Year's Day", fixed(1, 1)],
		['Martin Luther King Jr. Day', nthWeekday(year, 1, 1, 3)],
		['Presidents Day', nthWeekday(year, 2, 1, 3)],
		['Memorial Day', lastWeekday(year, 5, 1)],
		['Juneteenth', fixed(6, 19)],
		['Independence Day', fixed(7, 4)],
		['Labor Day', nthWeekday(year, 9, 1, 1)],
		['Columbus Day', nthWeekday(year, 10, 1, 2)],
		['Veterans Day', fixed(11, 11)],
		['Thanksgiving Day', nthWeekday(year, 11, 4, 4)],
		['Christmas Day', fixed(12, 25)]
	].map(([name, date]) => ({ name, date, type: 'federal-holiday' }));
}

// The anchor's year starts the window the app gives a new Organization (the year before it
// through two after). A closure never lands on a day that already holds one, as the app's
// closure command skips such days.
function specialDays({ federalHolidayYears, trainingHolidays, blockLeaveWeekdays }, anchor, seed) {
	const first = Number(anchor.slice(0, 4)) - 1;
	const years = Array.from({ length: federalHolidayYears }, (_, index) => first + index);
	const days = years.flatMap(federalHolidays);
	const taken = new Set(days.map((day) => day.date));
	const close = (name, date) => {
		if (taken.has(date)) return;
		taken.add(date);
		days.push({ name, date, type: 'org-closure' });
	};
	if (trainingHolidays)
		for (const holiday of days.filter((day) => [1, 4].includes(weekday(day.date))))
			close('Training holiday', addDays(holiday.date, weekday(holiday.date) === 1 ? -3 : 1));
	for (const year of years)
		for (let date = `${year}-12-22`, left = blockLeaveWeekdays; left > 0; date = addDays(date, 1))
			if (weekday(date) % 6 !== 0) {
				close('Holiday block leave', date);
				left -= 1;
			}
	const next = random(seed);
	return days.toSorted((a, b) => a.date.localeCompare(b.date)).map((day) => ({ id: uuidFrom(next), ...day }));
}

/**
 * Every row of one workload, deterministic for a name and anchor day. The anchor is
 * the run's local day, so a later run keeps the same shape relative to "today".
 */
export function expandWorkload(name, { anchor, owner, scoped, scopedLeader, members }) {
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
	// The Group-scoped editor holds personnel configure, so it opens a Person's detail in its Group.
	// Its ID comes from its own generator, so every other row stays as in workloads seeded before it.
	rows.organization_memberships.push(
		inOrganization({
			id: uuidFrom(random(`t2t-perf-workload:${name}:scoped-leader`)),
			user_id: scopedLeader.id,
			email: scopedLeader.email,
			role: 'member',
			member_preset: 'editor',
			capability_overrides: capabilities('configure'),
			access_scope_kind: 'groups',
			access_scope_group_ids: [scopedGroup.id]
		})
	);

	const palette = ['#166534', '#1d4ed8', '#7c2d12', '#7e22ce', '#0f766e', '#b45309', '#be123c', '#4d7c0f'];
	rows.status_types = [
		['Leave', 'LV'],
		['TDY', 'TDY'],
		['Appointment', 'APT'],
		['School', 'SCH'],
		['Sick Call', 'SC'],
		['Field', 'FLD'],
		['Pass', 'PS'],
		['Quarters', 'QTR']
	]
		.slice(0, shape.statusTypes)
		.map(([statusName, shortLabel], index) =>
			inOrganization({
				id: id(),
				name: statusName,
				short_label: shortLabel,
				color: palette[index],
				text_color: '#ffffff',
				sort_order: index
			})
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
				show_on_calendar: index < shape.calendarLanes
			})
		);
	rows.special_days = specialDays(shape.specialDays, anchor, `t2t-perf-workload:${name}:special-days`).map((day) =>
		inOrganization(day)
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
	const searched = {
		wide: active[Math.floor(active.length / 2)],
		scoped: scopedPeople[Math.floor(scopedPeople.length / 2)]
	};
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
		searchTerms: { wide: searched.wide.last_name, scoped: searched.scoped.last_name },
		journeyTerms: journeyTerms({ anchor, rows, active, scopedPeople, searched }),
		window: { start: addDays(anchor, -shape.windowDays.past), end: addDays(anchor, shape.windowDays.future) }
	};
}

const rankedLabel = (person) => `${person.rank} ${person.last_name}, ${person.first_name}`;
// The Duty planner names a date in the browser's en-GB short form, which spells September `Sept`.
const plannerDate = (date) =>
	new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

/**
 * The fixed targets the write and filter journeys act on, chosen from the expanded rows so
 * both actors can reach them. The assignment slot is the first Person slot in the anchor
 * month (the month the Planner opens on) held by someone in the scoped Group, so the
 * scoped actor sees it occupied and may reassign it within that Group.
 */
function journeyTerms({ anchor, rows, active, scopedPeople, searched }) {
	const byId = new Map(active.map((person) => [person.id, person]));
	const personTypes = new Map(
		rows.assignment_types.filter((type) => type.assign_to === 'personnel').map((type) => [type.id, type])
	);
	const slot = rows.daily_assignments
		.filter((row) => row.date.startsWith(anchor.slice(0, 7)) && personTypes.has(row.assignment_type_id))
		.toSorted(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				personTypes.get(a.assignment_type_id).sort_order - personTypes.get(b.assignment_type_id).sort_order
		)
		.find((row) => scopedPeople.some((person) => person.id === row.assignee_id));
	if (!slot) throw new Error('The anchor month has no Person assignment slot inside the scoped Group.');
	const holder = byId.get(slot.assignee_id);
	const alternate = scopedPeople
		.toSorted((a, b) => a.last_name.localeCompare(b.last_name))
		.find((person) => person !== holder);
	const otherMos = (mos) => (mos === '42A' ? '88M' : '42A');
	const edit = (person) => ({
		row: `Open ${rankedLabel(person)}`,
		original: person.mos,
		alternate: otherMos(person.mos)
	});
	return {
		assignment: {
			control: `${personTypes.get(slot.assignment_type_id).name}, ${plannerDate(slot.date)}: `,
			original: { label: rankedLabel(holder), search: holder.last_name },
			alternate: { label: rankedLabel(alternate), search: alternate.last_name }
		},
		edit: { wide: edit(searched.wide), scoped: edit(searched.scoped) },
		population: { wide: active.length, scoped: scopedPeople.length },
		members: rows.organization_memberships.length,
		filter: {
			term: '68W',
			rows: {
				wide: active.filter((person) => person.mos === '68W').length,
				scoped: scopedPeople.filter((person) => person.mos === '68W').length
			}
		}
	};
}

// A quarter of the active roster arrives at once (a reflag or a new company joining the
// battalion), all into the scoped Group so both actors may import the same file.
export function importCsv(name, anchor) {
	const shape = workloads[name];
	if (!shape) throw new Error(`Unknown workload ${name}; use ${Object.keys(workloads).join(', ')}.`);
	const count = Math.round((shape.groups * shape.personnelPerGroup) / 4);
	const lines = ['Rank,Last Name,First Name,MOS,Duty Role,Group,ETS,PCS / DEROS'];
	for (let index = 0; index < count; index++)
		lines.push(
			[
				['PFC', 'SPC', 'SGT', 'SSG'][index % 4],
				`Arrival${String(index + 1).padStart(3, '0')}`,
				firstNames[index % firstNames.length],
				mosCodes[index % mosCodes.length],
				roles[index % roles.length],
				groupNames[0],
				addDays(anchor, 400 + index),
				index % 3 ? '' : addDays(anchor, 200 + index)
			].join(',')
		);
	return { rows: count, text: lines.join('\n') + '\n' };
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

export async function seedWorkload({ client, fixture, name, tag, ownedState, save, prepare }) {
	ownedState.workloads ??= {};
	if (ownedState.workloads[name]) throw new Error(`Clean the existing ${name} workload before seeding it again.`);
	const owner = fixture.actors.perfWide;
	const scoped = fixture.actors.perfScoped;
	const scopedLeader = fixture.actors.perfScopedLeader;
	if (!owner || !scoped || !scopedLeader) throw new Error('This worker predates the performance actors; restart it.');
	const members = workloadMembers(name, tag);
	const expanded = expandWorkload(name, { anchor: fixture.dates.ui, owner, scoped, scopedLeader, members });
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
		journeyTerms: expanded.journeyTerms,
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
	// Planner statistics and visibility of fresh rows otherwise wait for autovacuum, which runs
	// at an unpredictable time during the first samples.
	let prepared;
	timings.prepare = await timed(async () => (prepared = await prepare()));
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
			perfScoped: { role: 'member', scope: 'groups', group: expanded.scopedGroup.name },
			perfScopedLeader: { role: 'member', preset: 'editor', scope: 'groups', group: expanded.scopedGroup.name }
		},
		sentinels: expanded.sentinels,
		searchTerms: expanded.searchTerms,
		journeyTerms: expanded.journeyTerms,
		planCache: prepared.planCache,
		timingsMs: { ...timings, total: Object.values(timings).reduce((sum, value) => sum + value, 0) }
	};
}

// Rows the app itself may write while a workload is driven, including the Personnel and daily
// assignments the write journeys create or replace and the export history an export writes. Organization deletion cascades all
// of them except audit_logs, whose org_id is ON DELETE SET NULL, so those rows survive it and
// are removed by ID first.
const appWrittenTables = [
	['personnel', 'organization_id'],
	['daily_assignments', 'organization_id'],
	['user_org_preferences', 'organization_id'],
	['user_pinned_groups', 'organization_id'],
	['getting_started_progress', 'organization_id'],
	['dashboard_configs', 'org_id'],
	['data_exports', 'org_id'],
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

/**
 * Removes the People an import sample added to a workload, so every import sample starts from
 * the seeded roster. Their IDs are journaled before the delete and read back after it.
 */
export async function removeImported({ client, ownedState, save, workload }) {
	const item = ownedState.workloads?.[workload];
	if (!item) throw new Error(`Workload ${workload} is not seeded.`);
	const seeded = new Set(item.tables.find(({ table }) => table === 'personnel').ids);
	const added = (await idsFor(client, 'personnel', 'organization_id', item.organizationId)).filter(
		(id) => !seeded.has(id)
	);
	item.appWritten ??= {};
	item.appWritten.personnel = [...new Set([...(item.appWritten.personnel ?? []), ...added])];
	await save(ownedState);
	for (let offset = 0; offset < added.length; offset += 200) {
		const { error } = await client
			.from('personnel')
			.delete()
			.eq('organization_id', item.organizationId)
			.in('id', added.slice(offset, offset + 200));
		if (error) throw new Error(`Disposable provider cleanup failed on personnel: ${error.message}`);
	}
	const left = await idsRemaining(client, 'personnel', added);
	if (left.length) throw new Error(`Imported People remain: ${left.join(', ')}`);
	return { removed: added.length };
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
