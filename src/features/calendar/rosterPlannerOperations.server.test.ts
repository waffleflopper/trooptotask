import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import {
	commitRosterFill,
	commitRosterReplacement,
	loadPlannerRosters,
	loadRosterDay,
	previewRosterFill,
	previewRosterReplacement
} from './rosterPlannerOperations.server';
import { octoberDate, R4_PICKS, R4_STARTING } from './roster/rosterFixtures.test-support';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import type { PlannerRoster, RosterDay, RosterReplacement } from './contracts';

const TYPE = '00000000-0000-4000-a000-000000000001';
const TDY = '00000000-0000-4000-a000-000000000021';
const LEAVE = '00000000-0000-4000-a000-000000000022';
const DETAIL = '00000000-0000-4000-a000-000000000023';
const TODAY = '2026-10-16';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;
type AssignmentRow = { id: string; date: string; assignment_type_id: string; assignee_id: string; source?: string };

const NAMES = [...R4_STARTING.map(([, lastName]) => lastName), 'Moreno'];
const idOf = (lastName: string) =>
	`00000000-0000-4000-a000-0000000001${String(NAMES.findIndex((name) => name.toLowerCase() === lastName.toLowerCase())).padStart(2, '0')}`;
const nameOf = (id: string) => NAMES[Number(id.slice(-2))].toLowerCase();

type Rules = { pool: { rank: null; mos: string[]; role: string[]; groupIds: string[] } | null; weekendMode: string };

/** Paper frame R4 in storage: Staff Duty from 1 Oct, its first 16 days served, today 16 Oct. */
function seedR4(ctx: Context, { rules = { pool: null, weekendMode: 'same' } as Rules, medics = [] as string[] } = {}) {
	const org = ctx.auth.orgId;
	ctx.store.seed('personnel', [
		...R4_STARTING.map(([rank, lastName]) =>
			personnel(org, rank, lastName, medics.includes(lastName.toLowerCase()) ? '68V' : '68W')
		),
		personnel(org, '1SG', 'Moreno')
	]);
	ctx.store.seed('assignment_types', [
		{
			id: TYPE,
			organization_id: org,
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#dc2626',
			sort_order: 0,
			show_on_calendar: true,
			roster_pool_rules: rules.pool,
			roster_weekend_mode: rules.weekendMode,
			archived_at: null
		}
	]);
	ctx.store.seed('roster_forms', [
		{
			id: 'form-open',
			organization_id: org,
			assignment_type_id: TYPE,
			starts_on: '2026-10-01',
			ends_on: null,
			rules,
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		R4_STARTING.map(([, lastName, count]) => ({
			organization_id: org,
			form_id: 'form-open',
			personnel_id: idOf(lastName),
			track: 'all',
			count,
			origin: 'typed'
		}))
	);
	ctx.store.seed('roster_excusals', [
		{
			id: 'excusal-moreno',
			organization_id: org,
			assignment_type_id: TYPE,
			personnel_id: idOf('moreno'),
			reason: 'First sergeant',
			starts_on: '2026-10-01',
			ends_on: null
		}
	]);
	ctx.store.seed('status_types', [
		statusType(org, TDY, 'TDY', 'A'),
		statusType(org, LEAVE, 'Leave', 'A'),
		statusType(org, DETAIL, 'Detail', 'D')
	]);
	ctx.store.seed('availability_entries', [
		availability(org, 'ortiz', TDY, '2026-10-12', '2026-10-16'),
		availability(org, 'okafor', LEAVE, '2026-10-20', '2026-10-23'),
		availability(org, 'patel', DETAIL, '2026-10-07', '2026-10-08')
	]);
	ctx.store.seed(
		'daily_assignments',
		R4_PICKS.slice(0, 16).map((lastName, index) => assignment(org, octoberDate(index + 1), lastName))
	);
}

function personnel(org: string, rank: string, lastName: string, mos = '68W') {
	return {
		id: idOf(lastName),
		organization_id: org,
		rank,
		last_name: lastName,
		first_name: 'A',
		mos,
		clinic_role: '',
		group_id: null,
		archived_at: null,
		created_at: '2026-01-01T00:00:00.000Z'
	};
}

function statusType(org: string, id: string, name: string, rosterEffect: string) {
	return {
		id,
		organization_id: org,
		name,
		color: '#ff0',
		text_color: '#000',
		sort_order: 0,
		roster_effect: rosterEffect
	};
}

function availability(org: string, lastName: string, statusTypeId: string, start: string, end: string) {
	return {
		id: `${lastName}-${start}`,
		organization_id: org,
		personnel_id: idOf(lastName),
		status_type_id: statusTypeId,
		start_date: start,
		end_date: end
	};
}

function assignment(org: string, date: string, lastName: string) {
	return { id: `sd-${date}`, organization_id: org, date, assignment_type_id: TYPE, assignee_id: idOf(lastName) };
}

const fillInput = (overrides: Record<string, unknown> = {}) => ({
	typeId: TYPE,
	today: TODAY,
	from: '2026-10-17',
	through: '2026-10-24',
	...overrides
});

/** One readable line per standing entry: `kim 12`, `ortiz A12 TDY`. */
function standingLines(roster: PlannerRoster, standing: readonly number[]) {
	const lines: string[] = [];
	for (let at = 0; at < standing.length; at += 3) {
		const [person, count, effect] = standing.slice(at, at + 3);
		const coded = effect ? roster.effects[effect - 1] : null;
		lines.push(`${nameOf(roster.people[person])} ${coded ? `${coded.code}${count} ${coded.reason}` : count}`);
	}
	return lines;
}

const staffDuty = async (ctx: Context) =>
	(await ctx.store.findMany<AssignmentRow>('daily_assignments', ctx.auth.orgId, { assignment_type_id: TYPE })).sort(
		(a, b) => a.date.localeCompare(b.date)
	);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('loadPlannerRosters', () => {
	it("returns today's counts, today's assignee, the excused and the month's detail days and conflicts", async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);
		// Patel on a detail the 28th is a D conflict on a hand-assigned day.
		ctx.store.seed('availability_entries', [availability(ctx.auth.orgId, 'patel', DETAIL, '2026-10-28', '2026-10-28')]);
		ctx.store.seed('daily_assignments', [assignment(ctx.auth.orgId, '2026-10-28', 'patel')]);

		const [roster] = await loadPlannerRosters(ctx, { today: TODAY, month: '2026-10' });

		expect(roster.typeId).toBe(TYPE);
		expect(roster.current).toHaveLength(1);
		expect(standingLines(roster, roster.current![0].standing)).toEqual([
			'ortiz A12 TDY',
			'kim 11',
			'brooks 10',
			'okafor 9',
			'nguyen 8',
			'hale 7',
			'morales 6',
			'liang 5',
			'fuller 4',
			'grant 3',
			'patel 2',
			'moss 1',
			'alvarez 0'
		]);
		expect(nameOf(roster.todayAssignee!)).toBe('alvarez');
		expect(roster.excused.map(nameOf)).toEqual(['moreno']);
		expect(roster.covered).toEqual(Array.from({ length: 31 }, (_, index) => octoberDate(index + 1)));
		expect(roster.conflicts.map(({ date, personId, code, reason }) => [date, nameOf(personId), code, reason])).toEqual([
			['2026-10-28', 'patel', 'D', 'Detail']
		]);
	});

	it("keeps today's counts for a month away from today and covers only that month's detail days", async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx, { rules: { pool: null, weekendMode: 'none' } });
		const [october] = await loadPlannerRosters(ctx, { today: TODAY, month: '2026-10' });

		const [december] = await loadPlannerRosters(ctx, { today: TODAY, month: '2026-12' });

		expect(december.current).toEqual(october.current);
		expect(december.todayAssignee).toBe(october.todayAssignee);
		expect(december.covered.slice(0, 5)).toEqual([
			'2026-12-01',
			'2026-12-02',
			'2026-12-03',
			'2026-12-04',
			'2026-12-07'
		]);
		expect(december.covered).toHaveLength(23);
		expect(december.conflicts).toEqual([]);
	});

	it('refuses a month starting beyond the planning horizon before reading or simulating', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '9999-12' })).rejects.toMatchObject({ status: 400 });
		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '2027-11' })).rejects.toMatchObject({ status: 400 });
		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '2027-10' })).resolves.toHaveLength(1);
	});

	it('settles its shared reads when the Organization has no open roster', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		ctx.store.seed('assignment_types', [
			{
				id: TYPE,
				organization_id: ctx.auth.orgId,
				name: 'Staff Duty',
				short_name: 'SD',
				assign_to: 'personnel',
				color: '#dc2626',
				sort_order: 0,
				show_on_calendar: true,
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				archived_at: null
			}
		]);
		vi.spyOn(ctx.personnelCalendarRoster, 'listAttributeTimelines').mockRejectedValue(new Error('timelines down'));
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);

		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '2026-10' })).resolves.toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 0));
		process.off('unhandledRejection', unhandled);

		expect(unhandled).not.toHaveBeenCalled();
	});

	it('keeps roster counts from a Group-scoped operator', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: { role: 'member', isPrivileged: false, scopeSet: { kind: 'groups', groupIds: ['group-a'] } }
		});
		seedR4(ctx);

		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '2026-10' })).rejects.toMatchObject({ status: 403 });
		await expect(previewRosterFill(ctx, fillInput())).rejects.toMatchObject({ status: 403 });
		await expect(loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: TODAY })).rejects.toMatchObject({
			status: 403
		});
	});
});

/** One readable line per picker entry: `kim 12`, `ortiz A12 TDY`. */
function dayLines(day: RosterDay) {
	if (day.track === null) return day.pool.map(nameOf);
	return day.standing.map(({ personId, count, effect }) =>
		effect ? `${nameOf(personId)} ${effect.code}${count} ${effect.reason}` : `${nameOf(personId)} ${count}`
	);
}

describe('loadRosterDay', () => {
	it('refuses a day beyond the planning horizon', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		await expect(loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: '9999-12-31' })).rejects.toMatchObject({
			status: 400
		});
		await expect(loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: '2027-10-18' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns the standing going into a detail day', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		const day = await loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: '2026-10-12' });

		expect(day?.track).toBe('all');
		expect(dayLines(day!).slice(0, 3)).toEqual(['fuller 12', 'ortiz A12 TDY', 'grant 11']);
		expect(dayLines(day!)).toHaveLength(13);
		expect(await loadRosterDay(ctx, { typeId: DETAIL, today: TODAY, date: '2026-10-12' })).toBeNull();
	});

	it('returns only the pool on a No duty weekend', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const pool = { rank: null, mos: ['68V'], role: [], groupIds: [] };
		seedR4(ctx, { rules: { pool, weekendMode: 'none' }, medics: ['kim', 'patel'] });

		const saturday = await loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: '2026-10-17' });
		const monday = await loadRosterDay(ctx, { typeId: TYPE, today: TODAY, date: '2026-10-19' });

		expect(saturday).toEqual({ track: null, pool: [idOf('kim'), idOf('patel')] });
		expect(monday?.track).toBe('weekday');
		expect(
			dayLines(monday!)
				.map((line) => line.split(' ')[0])
				.sort()
		).toEqual(['kim', 'patel']);
	});
});

describe('Fill from roster', () => {
	it('previews the R4 picks for the open days with who it skipped and who came back', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		const preview = await previewRosterFill(ctx, fillInput());

		expect(preview.picks.map(({ date, personId, count }) => `${date.slice(8)} ${nameOf(personId)} ${count}`)).toEqual([
			'17 ortiz 13',
			'18 kim 13',
			'19 brooks 13',
			'20 nguyen 12',
			'21 hale 12',
			'22 morales 12',
			'23 liang 12',
			'24 okafor 13'
		]);
		expect(preview.picks[0].returningFrom).toBe('TDY');
		expect(preview.picks[3].passedOver.map((skip) => ({ ...skip, personId: nameOf(skip.personId) }))).toEqual([
			{ personId: 'okafor', count: 12, code: 'A', reason: 'Leave' }
		]);
		expect(preview.unfilled).toEqual([]);
	});

	it('writes the previewed picks as roster picks on the open days only', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);
		ctx.store.seed('daily_assignments', [assignment(ctx.auth.orgId, '2026-10-19', 'brooks')]);
		const preview = await previewRosterFill(ctx, fillInput());

		const { saved } = await commitRosterFill(ctx, {
			...fillInput(),
			picks: preview.picks.map(({ date, personId }) => ({ date, personId }))
		});

		expect(saved.map((row) => row.date)).toEqual([
			'2026-10-17',
			'2026-10-18',
			'2026-10-20',
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24'
		]);
		const stored = (await staffDuty(ctx)).filter((row) => row.date > TODAY);
		expect(stored.map((row) => `${row.date.slice(8)} ${nameOf(row.assignee_id)} ${row.source ?? 'manual'}`)).toEqual([
			'17 ortiz roster',
			'18 kim roster',
			'19 brooks manual',
			'20 nguyen roster',
			'21 hale roster',
			'22 morales roster',
			'23 liang roster',
			'24 okafor roster'
		]);
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'daily_assignment.roster_filled',
				details: { assignmentTypeId: TYPE, from: '2026-10-17', through: '2026-10-24', days: 7 }
			})
		);
	});

	it('refuses a preview the roster has moved past and writes nothing', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);
		const preview = await previewRosterFill(ctx, fillInput());
		ctx.store.seed('daily_assignments', [assignment(ctx.auth.orgId, '2026-10-18', 'moss')]);

		await expect(
			commitRosterFill(ctx, { ...fillInput(), picks: preview.picks.map(({ date, personId }) => ({ date, personId })) })
		).rejects.toMatchObject({ status: 409 });
		expect((await staffDuty(ctx)).filter((row) => row.date > TODAY).map((row) => row.date)).toEqual(['2026-10-18']);
	});

	it('refuses a fill starting beyond the planning horizon', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);
		const far = fillInput({ from: '9999-12-01', through: '9999-12-31' });

		await expect(previewRosterFill(ctx, far)).rejects.toMatchObject({ status: 400 });
		await expect(
			commitRosterFill(ctx, { ...far, picks: [{ date: '9999-12-01', personId: idOf('kim') }] })
		).rejects.toMatchObject({ status: 400 });
		expect(await staffDuty(ctx)).toHaveLength(16);
	});

	it('clamps a fill that runs past the planning horizon to the horizon', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		const preview = await previewRosterFill(ctx, fillInput({ from: '2027-10-14', through: '2028-03-01' }));

		expect(preview.picks.map((pick) => pick.date)).toEqual(['2027-10-14', '2027-10-15', '2027-10-16', '2027-10-17']);
		expect(preview.unfilled).toEqual([]);
	});

	it('fills from today at the earliest', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		await expect(previewRosterFill(ctx, fillInput({ from: '2026-10-15' }))).rejects.toMatchObject({ status: 400 });
	});
});

/**
 * R4 with Okafor hand-assigned on the 20th, inside his leave, Moss by hand on the 22nd, and the open days filled.
 * The Organization keeps the built-in rank catalog, so ties go to the higher rank.
 */
async function seedConflict(ctx: Context) {
	seedR4(ctx);
	ctx.store.seed(
		'organization_rank_catalog',
		BUILT_IN_RANK_CATALOG.filter((entry) => entry.service === 'army').map((entry, index) => ({
			id: `rank-${index}`,
			organization_id: ctx.auth.orgId,
			code: entry.code,
			label: entry.label,
			service: entry.service,
			category: entry.category,
			pay_grade: entry.payGrade,
			state: entry.state,
			source: 'built-in',
			sort_order: entry.sortOrder
		}))
	);
	ctx.store.seed('daily_assignments', [
		assignment(ctx.auth.orgId, '2026-10-20', 'okafor'),
		assignment(ctx.auth.orgId, '2026-10-22', 'moss')
	]);
	const preview = await previewRosterFill(ctx, fillInput());
	await commitRosterFill(ctx, {
		...fillInput(),
		picks: preview.picks.map(({ date, personId }) => ({ date, personId }))
	});
}

const replacementInput = (overrides: Record<string, unknown> = {}) => ({
	typeId: TYPE,
	today: TODAY,
	date: '2026-10-20',
	...overrides
});

const commitInput = (preview: RosterReplacement) => ({
	...replacementInput(),
	assigneeId: preview.selected,
	replacing: preview.replacing.personId,
	repicks: preview.repicks.map(({ date, was, personId }) => ({ date, was, personId }))
});

const repickLines = (preview: RosterReplacement) =>
	preview.repicks.map(({ date, was, personId }) => `${date.slice(8)} ${nameOf(was)} → ${nameOf(personId)}`);

const storedLines = async (ctx: Context) =>
	(await staffDuty(ctx))
		.filter((row) => row.date > TODAY)
		.map((row) => `${row.date.slice(8)} ${nameOf(row.assignee_id)} ${row.source ?? 'manual'}`);

describe('Find replacement', () => {
	it("preselects the rule's pick and lists who cannot pull and the planned days it re-picks", async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);

		const preview = await previewRosterReplacement(ctx, replacementInput());

		expect(preview.replacing).toEqual({ personId: idOf('okafor'), count: 12, effect: { code: 'A', reason: 'Leave' } });
		expect(nameOf(preview.nextUp!)).toBe('nguyen');
		expect(preview.selected).toBe(preview.nextUp);
		expect(
			preview.candidates.map(
				({ personId, count, adjacent }) =>
					`${nameOf(personId)} ${count}${adjacent.map(({ name, day }) => `, ${name} ${day}`).join('')}`
			)
		).toEqual([
			'nguyen 12, Staff Duty after',
			'hale 11',
			'morales 10',
			'liang 9',
			'fuller 8',
			'grant 7',
			'patel 6',
			'moss 5',
			'alvarez 4',
			'ortiz 3',
			'kim 2',
			'brooks 1, Staff Duty before'
		]);
		expect(
			preview.cantPull.map(({ personId, count, code, reason }) => `${nameOf(personId)} ${code}${count} ${reason}`)
		).toEqual(['okafor A12 Leave']);
		expect(repickLines(preview)).toEqual(['21 nguyen → hale', '23 hale → morales', '24 morales → okafor']);
		expect(preview.unfilled).toEqual([]);
	});

	it('re-picks for the candidate chosen instead', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);

		const preview = await previewRosterReplacement(ctx, replacementInput({ assigneeId: idOf('hale') }));

		expect(nameOf(preview.selected!)).toBe('hale');
		expect(nameOf(preview.nextUp!)).toBe('nguyen');
		expect(repickLines(preview)).toEqual(['23 hale → morales', '24 morales → okafor']);
	});

	it('writes the replacement and exactly the previewed re-picks, and never a hand-assigned day', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);
		const preview = await previewRosterReplacement(ctx, replacementInput());

		const { saved } = await commitRosterReplacement(ctx, commitInput(preview));

		expect(saved.map((row) => `${row.date.slice(8)} ${nameOf(row.assigneeId)}`)).toEqual([
			'20 nguyen',
			'21 hale',
			'23 morales',
			'24 okafor'
		]);
		expect(await storedLines(ctx)).toEqual([
			'17 ortiz roster',
			'18 kim roster',
			'19 brooks roster',
			'20 nguyen roster',
			'21 hale roster',
			'22 moss manual',
			'23 morales roster',
			'24 okafor roster'
		]);
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'daily_assignment.roster_replaced',
				details: { assignmentTypeId: TYPE, date: '2026-10-20', repicks: 3 }
			})
		);
	});

	it("writes someone other than the rule's pick as a hand assignment", async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);
		const preview = await previewRosterReplacement(ctx, replacementInput({ assigneeId: idOf('hale') }));

		await commitRosterReplacement(ctx, commitInput(preview));

		expect(await storedLines(ctx)).toEqual([
			'17 ortiz roster',
			'18 kim roster',
			'19 brooks roster',
			'20 hale manual',
			'21 nguyen roster',
			'22 moss manual',
			'23 morales roster',
			'24 okafor roster'
		]);
	});

	it('refuses a preview the roster has moved past and writes nothing', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);
		const preview = await previewRosterReplacement(ctx, replacementInput());
		ctx.store.seed('availability_entries', [availability(ctx.auth.orgId, 'hale', LEAVE, '2026-10-21', '2026-10-21')]);

		await expect(commitRosterReplacement(ctx, commitInput(preview))).rejects.toMatchObject({ status: 409 });
		expect(await storedLines(ctx)).toEqual([
			'17 ortiz roster',
			'18 kim roster',
			'19 brooks roster',
			'20 okafor manual',
			'21 nguyen roster',
			'22 moss manual',
			'23 hale roster',
			'24 morales roster'
		]);
	});

	it('refuses a preview when another operator changed a re-picked day to someone the re-pick leaves anyway', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		await seedConflict(ctx);
		const preview = await previewRosterReplacement(ctx, replacementInput());
		const [row] = (await staffDuty(ctx)).filter((stored) => stored.date === '2026-10-23');
		await ctx.store.compareAndUpdateMany('daily_assignments', ctx.auth.orgId, [
			{ id: row.id, expected: { assignee_id: idOf('hale') }, patch: { assignee_id: idOf('liang') } }
		]);

		await expect(commitRosterReplacement(ctx, commitInput(preview))).rejects.toMatchObject({ status: 409 });
		expect(await storedLines(ctx)).toEqual([
			'17 ortiz roster',
			'18 kim roster',
			'19 brooks roster',
			'20 okafor manual',
			'21 nguyen roster',
			'22 moss manual',
			'23 liang roster',
			'24 morales roster'
		]);
	});

	it('refuses a replacement that leaves a planned day with nobody to take it', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const pool = { rank: null, mos: ['68V'], role: [], groupIds: [] };
		seedR4(ctx, { rules: { pool, weekendMode: 'same' }, medics: ['kim', 'patel'] });
		ctx.store.seed('availability_entries', [
			availability(ctx.auth.orgId, 'kim', LEAVE, '2026-10-17', '2026-10-18'),
			availability(ctx.auth.orgId, 'patel', DETAIL, '2026-10-18', '2026-10-18')
		]);
		ctx.store.seed('daily_assignments', [
			assignment(ctx.auth.orgId, '2026-10-17', 'kim'),
			{ ...assignment(ctx.auth.orgId, '2026-10-18', 'patel'), source: 'roster' }
		]);
		const input = replacementInput({ date: '2026-10-17' });

		const preview = await previewRosterReplacement(ctx, input);

		expect(nameOf(preview.selected!)).toBe('patel');
		expect(preview.unfilled).toEqual(['2026-10-18']);
		await expect(commitRosterReplacement(ctx, { ...commitInput(preview), date: '2026-10-17' })).rejects.toMatchObject({
			status: 409,
			message: 'Nobody on the roster can take every re-picked day. Choose someone else.'
		});
		expect((await storedLines(ctx)).join(', ')).toBe('17 kim manual, 18 patel roster');
	});

	it('keeps Find replacement from a Group-scoped operator', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: { role: 'member', isPrivileged: false, scopeSet: { kind: 'groups', groupIds: ['group-a'] } }
		});
		seedR4(ctx);

		await expect(previewRosterReplacement(ctx, replacementInput())).rejects.toMatchObject({ status: 403 });
	});

	it('refuses a replacement beyond the planning horizon before reading the roster', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		await expect(previewRosterReplacement(ctx, replacementInput({ date: '9999-12-31' }))).rejects.toMatchObject({
			status: 400
		});
	});
});
