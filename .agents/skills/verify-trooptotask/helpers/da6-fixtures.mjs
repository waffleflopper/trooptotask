import { randomUUID } from 'node:crypto';

// In DA 6 order: rank, then last name.
const people = [
	['SGT', 'Grant'],
	['SGT', 'Okafor'],
	['SPC', 'Kim'],
	['SPC', 'Nguyen'],
	['SPC', 'Patel'],
	['PFC', 'Brooks'],
	['PFC', 'Ortiz'],
	['PV2', 'Diaz']
];
const RANKS = ['SGT', 'SPC', 'PFC', 'PV2'];
const DAYS = 21;
const CQ_DAYS = [1, 5, 9, 14];
// Okafor holds the lead through day 9, so Nguyen pulls it and Okafor goes first after returning.
const LEAVE = { person: 1, from: 8, through: 9 };

const addDays = (date, days) => {
	const value = new Date(date + 'T00:00:00Z');
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
};

/**
 * Picks by the DA 6 rule: on each day everyone available moves up one, the highest number pulls it and starts over,
 * ties go to whoever is higher on the form. Away holds; other duty runs but cannot pull it.
 */
export function rulePicks({ size, days, dutyDay, away, otherDuty }) {
	const counts = new Array(size).fill(0);
	return Array.from({ length: days }, (_, day) => {
		if (!dutyDay(day)) return null;
		let pick = -1;
		for (let slot = 0; slot < size; slot++) {
			if (away(slot, day) || otherDuty(slot, day)) continue;
			if (pick < 0 || counts[slot] > counts[pick]) pick = slot;
		}
		for (let slot = 0; slot < size; slot++) if (!away(slot, day)) counts[slot] += 1;
		counts[pick] = 0;
		return pick;
	});
}

/** The eight named People, then synthetic Recruits up to `size`. */
export function rosterPeople(size = people.length) {
	if (!Number.isInteger(size) || size < people.length || size > 80) throw new Error('Roster size is 8 to 80.');
	return [
		...people,
		...Array.from({ length: size - people.length }, (_, index) => [
			RANKS[index % RANKS.length],
			`Recruit${String(index + 1).padStart(2, '0')}`
		])
	];
}

export async function seedDa6({ client, fixture, tag, ownedState, save, month, size }) {
	if (ownedState.seeded.some((item) => item.kind === 'da6'))
		throw new Error('Clean the existing da6 seed before preparing another roster.');
	if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
		throw new Error('Use seed da6 [YYYY-MM [PEOPLE]].');
	const { ids } = fixture;
	// Forms open on the UTC day, so the seeded duty starts there.
	const today = new Date().toISOString().slice(0, 10);
	const roster = rosterPeople(size === undefined ? undefined : Number(size));
	const personnel = roster.map(([rank, lastName], index) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		first_name: 'Synthetic',
		last_name: lastName,
		slug: `da6-${tag}-${index + 1}`,
		rank,
		mos: '92Y',
		clinic_role: ''
	}));
	const pool = { rank: null, mos: ['92Y'], role: [], groupIds: [] };
	const type = (name, shortName, sortOrder) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		name,
		short_name: shortName,
		assign_to: 'personnel',
		color: '#7c2d12',
		sort_order: sortOrder,
		show_on_calendar: false,
		roster_pool_rules: pool,
		roster_weekend_mode: 'same'
	});
	const staffDuty = type('Staff Duty', 'SD', 20);
	const chargeOfQuarters = type('Charge of Quarters', 'CQ', 21);
	// With a month (YYYY-MM within 120 days), Staff Duty alone has a detail every day of it: the widest grid DA 6 prints.
	const days = month ? 120 : DAYS;
	const away = (slot, day) => !month && slot === LEAVE.person && day >= LEAVE.from && day <= LEAVE.through;
	const cqPicks = rulePicks({
		size: roster.length,
		days,
		dutyDay: (day) => !month && CQ_DAYS.includes(day),
		away,
		otherDuty: () => false
	});
	// CQ is picked first each day, so its detail is other duty for Staff Duty.
	const sdPicks = rulePicks({
		size: roster.length,
		days,
		dutyDay: (day) => !month || addDays(today, day).startsWith(month),
		away,
		otherDuty: (slot, day) => cqPicks[day] === slot
	});
	const assignments = [
		[staffDuty, sdPicks],
		[chargeOfQuarters, cqPicks]
	].flatMap(([duty, picks]) =>
		picks.flatMap((slot, day) =>
			slot === null
				? []
				: [
						{
							id: randomUUID(),
							organization_id: ids.orgA,
							date: addDays(today, day),
							assignment_type_id: duty.id,
							assignee_id: personnel[slot].id
						}
					]
		)
	);
	const leave = {
		id: randomUUID(),
		organization_id: ids.orgA,
		personnel_id: personnel[LEAVE.person].id,
		status_type_id: ids.statusLeave,
		start_date: addDays(today, LEAVE.from),
		end_date: addDays(today, LEAVE.through),
		note: 'DA 6 seeded leave'
	};
	const batches = [
		['personnel', personnel],
		['assignment_types', [staffDuty, chargeOfQuarters]],
		['daily_assignments', assignments],
		['availability_entries', month ? [] : [leave]]
	].filter(([, rows]) => rows.length);
	for (const [table, rows] of batches)
		ownedState.seeded.push({ kind: 'da6', table, organization: 'orgA', tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	for (const [table, rows] of batches) {
		const result = await client.from(table).insert(rows);
		if (result.error) throw new Error('Owned da6 setup failed: ' + result.error.message);
	}
	return {
		tag,
		today,
		staffDuty: staffDuty.id,
		chargeOfQuarters: chargeOfQuarters.id,
		people: Object.fromEntries(personnel.map(({ id, last_name }) => [last_name, id])),
		staffDutyDays: sdPicks.flatMap((slot, day) => (slot === null ? [] : [`${addDays(today, day)} ${roster[slot][1]}`])),
		chargeOfQuartersDays: cqPicks.flatMap((slot, day) =>
			slot === null ? [] : [`${addDays(today, day)} ${roster[slot][1]}`]
		),
		leave: month ? 'none' : `Okafor ${leave.start_date} through ${leave.end_date}`,
		boundary:
			'Journaled source setup only in the toolkit-owned disposable provider. Forms open through the type trigger.'
	};
}
