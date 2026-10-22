import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { loadDa6View } from './da6Operations.server';
import { loadDa6Setup, loadStartingNumbersStatus, saveStartingNumbers } from './rosterStartingNumbersOperations.server';
import { gridLines } from './roster/rosterFixtures.test-support';

const SD = '00000000-0000-4000-a000-000000000001';
const SHIFT = '00000000-0000-4000-a000-000000000002';
const FORM = '00000000-0000-4000-a000-000000000003';
const PIKE = '00000000-0000-4000-a000-000000000011';
const KIM = '00000000-0000-4000-a000-000000000012';
const LEE = '00000000-0000-4000-a000-000000000013';
const TODAY = '2026-10-16';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;
type AssignmentRow = { date: string; assignee_id: string; source?: string };

const NAMES: Record<string, string> = { [PIKE]: 'pike', [KIM]: 'kim', [LEE]: 'lee' };

/**
 * Staff Duty with a form opened today. The roster planned 17 to 19 Oct, Lee was assigned the 20th by hand, and
 * nothing is served yet.
 */
function seed(
	ctx: Context,
	{
		weekendMode = 'same',
		numbers = [] as { personId: string; count: number; origin: string }[],
		days = [
			['2026-10-17', PIKE, 'roster'],
			['2026-10-18', KIM, 'roster'],
			['2026-10-19', LEE, 'roster'],
			['2026-10-20', LEE, 'manual']
		] as [string, string, string][]
	} = {}
) {
	const org = ctx.auth.orgId;
	const person = (id: string, rank: string, lastName: string) => ({
		id,
		organization_id: org,
		rank,
		last_name: lastName,
		first_name: 'A',
		mos: '68W',
		clinic_role: '',
		group_id: null,
		archived_at: null,
		created_at: '2026-09-01T00:00:00.000Z'
	});
	ctx.store.seed('personnel', [person(PIKE, 'SGT', 'Pike'), person(KIM, 'SPC', 'Kim'), person(LEE, 'PFC', 'Lee')]);
	const type = (id: string, name: string, shortName: string, assignTo: string) => ({
		id,
		organization_id: org,
		name,
		short_name: shortName,
		assign_to: assignTo,
		color: '#dc2626',
		sort_order: 0,
		show_on_calendar: true,
		roster_pool_rules: null,
		roster_weekend_mode: weekendMode,
		archived_at: null
	});
	ctx.store.seed('assignment_types', [type(SD, 'Staff Duty', 'SD', 'personnel'), type(SHIFT, 'Shift', 'SH', 'group')]);
	ctx.store.seed('roster_forms', [
		{
			id: FORM,
			organization_id: org,
			assignment_type_id: SD,
			starts_on: TODAY,
			ends_on: null,
			rules: { pool: null, weekendMode },
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		numbers.map(({ personId, count, origin }) => ({
			organization_id: org,
			form_id: FORM,
			personnel_id: personId,
			track: 'all',
			count,
			origin
		}))
	);
	ctx.store.seed(
		'daily_assignments',
		days.map(([date, assigneeId, source]) => ({
			id: `sd-${date}`,
			organization_id: org,
			date,
			assignment_type_id: SD,
			assignee_id: assigneeId,
			source
		}))
	);
}

const save = (ctx: Context, numbers: { personId: string; track?: string; count: number }[], overrides = {}) =>
	saveStartingNumbers(ctx, {
		typeId: SD,
		formId: FORM,
		today: TODAY,
		numbers: numbers.map(({ track = 'all', ...number }) => ({ ...number, track })),
		...overrides
	});

const staffDuty = async (ctx: Context) =>
	(await ctx.store.findMany<AssignmentRow>('daily_assignments', ctx.auth.orgId, { assignment_type_id: SD }))
		.sort((a, b) => a.date.localeCompare(b.date))
		.map(({ date, assignee_id, source }) => `${date} ${NAMES[assignee_id]} ${source}`);

const typedNumbers = async (ctx: Context) =>
	(
		await ctx.store.findMany<{ personnel_id: string; count: number; origin: string }>(
			'roster_starting_numbers',
			ctx.auth.orgId,
			{ form_id: FORM }
		)
	).map(({ personnel_id, count, origin }) => `${NAMES[personnel_id]} ${count} ${origin}`);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('saveStartingNumbers', () => {
	it('re-picks the roster’s planned days under the typed numbers and leaves the hand-assigned day', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		await save(ctx, [
			{ personId: KIM, count: 9 },
			{ personId: LEE, count: 4 }
		]);

		expect(await typedNumbers(ctx)).toEqual(['kim 9 typed', 'lee 4 typed']);
		expect(await staffDuty(ctx)).toEqual([
			'2026-10-17 kim roster',
			'2026-10-18 lee roster',
			'2026-10-19 pike roster',
			'2026-10-20 lee manual'
		]);
	});

	it('changes a person’s count only until their first detail', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		await save(ctx, [
			{ personId: KIM, count: 9 },
			{ personId: LEE, count: 4 }
		]);
		const view = await loadDa6View(ctx, { typeId: SD, month: '2026-10', today: TODAY });

		// Pike's blank starts at Lee's 4, the lowest typed number. Kim's 9 counts until the 17th, Lee's 4 until the 18th.
		expect(gridLines(view.sheets[0].segment!)).toEqual(['PFC Lee 5 *6 1 *2', 'SGT Pike 5 6 *7 1', 'SPC Kim *10 1 2 3']);
	});

	it('refuses once a detail on the form is served, and changes nothing', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, {
			numbers: [{ personId: KIM, count: 2, origin: 'typed' }],
			days: [
				[TODAY, KIM, 'roster'],
				['2026-10-17', PIKE, 'roster']
			]
		});

		await expect(save(ctx, [{ personId: LEE, count: 7 }])).rejects.toMatchObject({ status: 409 });

		expect(await typedNumbers(ctx)).toEqual(['kim 2 typed']);
		expect(await staffDuty(ctx)).toEqual(['2026-10-16 kim roster', '2026-10-17 pike roster']);
	});

	it('refuses to edit numbers carried over from the last form', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { numbers: [{ personId: KIM, count: 6, origin: 'carried' }] });

		await expect(save(ctx, [{ personId: LEE, count: 7 }])).rejects.toMatchObject({ status: 409 });

		expect(await typedNumbers(ctx)).toEqual(['kim 6 carried']);
	});

	it('refuses a stale form and a track the weekend rule does not keep', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		await expect(
			save(ctx, [{ personId: KIM, count: 3 }], { formId: '00000000-0000-4000-a000-000000000099' })
		).rejects.toMatchObject({ status: 409 });
		await expect(save(ctx, [{ personId: KIM, track: 'weekend', count: 3 }])).rejects.toMatchObject({ status: 400 });
		expect(await typedNumbers(ctx)).toEqual([]);
	});

	it('refuses a Calendar operator who cannot configure assignment types', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		seed(ctx);

		await expect(save(ctx, [{ personId: KIM, count: 3 }])).rejects.toMatchObject({ status: 403 });
	});
});

describe('loadDa6Setup', () => {
	it('puts the inputs in the first weekday and the first weekend column under a separate count', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { weekendMode: 'separate', days: [] });

		const { form } = await loadDa6Setup(ctx, { typeId: SD, today: TODAY });

		expect(form?.columns).toEqual([
			{ date: '2026-10-16', track: 'weekday' },
			{ date: '2026-10-17', track: 'weekend' }
		]);
		expect(form?.rows.map(({ lastName }) => lastName)).toEqual(['Lee', 'Pike', 'Kim']);
		expect(form?.state).toBe('editable');
	});
});

describe('loadStartingNumbersStatus', () => {
	it.each([
		['editable', [], [] as [string, string, string][]],
		['locked', [], [[TODAY, KIM, 'roster']] as [string, string, string][]],
		['carried', [{ personId: KIM, count: 6, origin: 'carried' }], []]
	])('reads %s', async (state, numbers, days) => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { numbers, days });

		expect(await loadStartingNumbersStatus(ctx, { typeId: SD, today: TODAY })).toEqual({
			state,
			numbered: numbers.length > 0
		});
	});

	it('has none for a Group-assigned type', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		await expect(loadStartingNumbersStatus(ctx, { typeId: SHIFT, today: TODAY })).rejects.toMatchObject({
			status: 404
		});
	});
});
