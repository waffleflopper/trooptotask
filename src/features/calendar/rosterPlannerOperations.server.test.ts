import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { commitRosterFill, loadPlannerRosters, previewRosterFill } from './rosterPlannerOperations.server';
import { octoberDate, R4_PICKS, R4_STARTING } from './roster/rosterFixtures.test-support';
import type { PlannerRoster } from './contracts';

const TYPE = '00000000-0000-4000-a000-000000000001';
const TDY = '00000000-0000-4000-a000-000000000021';
const LEAVE = '00000000-0000-4000-a000-000000000022';
const DETAIL = '00000000-0000-4000-a000-000000000023';
const TODAY = '2026-10-16';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;
type AssignmentRow = { date: string; assignment_type_id: string; assignee_id: string; source?: string };

const NAMES = [...R4_STARTING.map(([, lastName]) => lastName), 'Moreno'];
const idOf = (lastName: string) =>
	`00000000-0000-4000-a000-0000000001${String(NAMES.findIndex((name) => name.toLowerCase() === lastName.toLowerCase())).padStart(2, '0')}`;
const nameOf = (id: string) => NAMES[Number(id.slice(-2))].toLowerCase();

/** Paper frame R4 in storage: Staff Duty from 1 Oct, its first 16 days served, today 16 Oct. */
function seedR4(ctx: Context, served = 16) {
	const org = ctx.auth.orgId;
	ctx.store.seed('personnel', [
		...R4_STARTING.map(([rank, lastName]) => personnel(org, rank, lastName)),
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
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
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
			rules: { pool: null, weekendMode: 'same' },
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
		R4_PICKS.slice(0, served).map((lastName, index) => assignment(org, octoberDate(index + 1), lastName))
	);
}

function personnel(org: string, rank: string, lastName: string) {
	return {
		id: idOf(lastName),
		organization_id: org,
		rank,
		last_name: lastName,
		first_name: 'A',
		mos: '68W',
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
	it("returns today's counts, each detail day's standing, today's assignee, the excused and the month's conflicts", async () => {
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
		expect(roster.days.map((day) => day.date)).toEqual(
			Array.from({ length: 31 }, (_, index) => octoberDate(index + 1))
		);
		expect(standingLines(roster, roster.days[11].standing).slice(0, 2)).toEqual(['fuller 12', 'ortiz A12 TDY']);
		expect(roster.conflicts.map(({ date, personId, code, reason }) => [date, nameOf(personId), code, reason])).toEqual([
			['2026-10-28', 'patel', 'D', 'Detail']
		]);
	});

	it('keeps roster counts from a Group-scoped operator', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: { role: 'member', isPrivileged: false, scopeSet: { kind: 'groups', groupIds: ['group-a'] } }
		});
		seedR4(ctx);

		await expect(loadPlannerRosters(ctx, { today: TODAY, month: '2026-10' })).rejects.toMatchObject({ status: 403 });
		await expect(previewRosterFill(ctx, fillInput())).rejects.toMatchObject({ status: 403 });
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

	it('fills from today at the earliest', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedR4(ctx);

		await expect(previewRosterFill(ctx, fillInput({ from: '2026-10-15' }))).rejects.toMatchObject({ status: 400 });
	});
});
