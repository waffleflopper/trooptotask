import { describe, expect, it } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { loadDa6View } from './da6Operations.server';
import { gridLines } from './roster/rosterFixtures.test-support';
import type { Da6Segment } from './roster/rosterTypes';

const SD = '00000000-0000-4000-a000-000000000001';
const SHIFT = '00000000-0000-4000-a000-000000000002';
const PIKE = '00000000-0000-4000-a000-000000000011';
const KIM = '00000000-0000-4000-a000-000000000012';
const GROUP = '00000000-0000-4000-a000-000000000031';
const TODAY = '2026-10-17';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;

const ref = (personId: string, rank: string, lastName: string) => ({ personId, rank, lastName, firstName: 'A' });

/** Saved when the rules changed on 10 Oct. Today's facts would compute different cells: nobody is on leave now. */
const SAVED: Da6Segment = {
	formId: 'sd-closed',
	formState: 'closed',
	natureOfDuty: 'Staff Duty',
	month: '2026-10',
	weekendMode: 'same',
	columns: [
		{
			date: '2026-10-05',
			track: 'all',
			when: 'served',
			pick: ref(PIKE, 'SGT', 'Pike'),
			source: 'manual',
			passedOver: [{ ...ref(KIM, 'SPC', 'Kim'), count: 4, code: 'A', reason: 'Leave' }],
			rulePick: null
		}
	],
	rows: [ref(PIKE, 'SGT', 'Pike'), ref(KIM, 'SPC', 'Kim')],
	cells: [[{ kind: 'detail', count: 7, when: 'served' }], [{ kind: 'away', count: 4, reason: 'Leave' }]],
	remarks: []
};

function seed(
	ctx: Context,
	{
		people = 2,
		days = ['2026-10-11', '2026-10-12', '2026-10-13'],
		record = { segments: [{ ...SAVED, month: '2026-09', columns: [], rows: [], cells: [] }, SAVED] } as unknown
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
		group_id: GROUP,
		archived_at: null,
		created_at: '2026-09-01T00:00:00.000Z'
	});
	const extra = Array.from({ length: people - 2 }, (_, index) =>
		person(`00000000-0000-4000-b000-${String(index).padStart(12, '0')}`, 'PVT', `Extra${index}`)
	);
	ctx.store.seed('personnel', [person(PIKE, 'SGT', 'Pike'), person(KIM, 'SPC', 'Kim'), ...extra]);
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
		roster_weekend_mode: 'same',
		archived_at: null
	});
	ctx.store.seed('assignment_types', [type(SD, 'Staff Duty', 'SD', 'personnel'), type(SHIFT, 'Shift', 'SH', 'group')]);
	const rules = { pool: null, weekendMode: 'same' };
	ctx.store.seed('roster_forms', [
		{
			id: 'sd-closed',
			organization_id: org,
			assignment_type_id: SD,
			starts_on: '2026-09-20',
			ends_on: '2026-10-10',
			rules,
			record
		},
		{
			id: 'sd-open',
			organization_id: org,
			assignment_type_id: SD,
			starts_on: '2026-10-11',
			ends_on: null,
			rules,
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		[
			[PIKE, 3],
			[KIM, 5]
		].map(([personnelId, count]) => ({
			organization_id: org,
			form_id: 'sd-open',
			personnel_id: personnelId,
			track: 'all',
			count,
			origin: 'carried'
		}))
	);
	ctx.store.seed(
		'daily_assignments',
		days.map((date, index) => ({
			id: `sd-${date}`,
			organization_id: org,
			date,
			assignment_type_id: SD,
			assignee_id: index % 2 ? KIM : PIKE
		}))
	);
}

describe('loadDa6View', () => {
	it('shows a month that spans a rule change as the saved closed form, then the open form from its first day', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		const view = await loadDa6View(ctx, { typeId: SD, month: '2026-10', today: TODAY });

		expect(view.roster).toEqual({ id: SD, name: 'Staff Duty', shortName: 'SD' });
		expect(view.rosters).toEqual([{ id: SD, name: 'Staff Duty', shortName: 'SD' }]);
		expect(view.sheets.map(({ from, to }) => [from, to])).toEqual([
			['2026-10-01', '2026-10-10'],
			['2026-10-11', null]
		]);
		expect(view.sheets[0].segment).toEqual(SAVED);
		expect(view.sheets[1].segment?.formState).toBe('open');
		expect(gridLines(view.sheets[1].segment!)).toEqual(['SGT Pike *4 1 *2', 'SPC Kim 6 *7 1']);
	});

	it.each([
		['an empty record', {}],
		['a segment missing its cells', { segments: [{ ...SAVED, cells: undefined }] }]
	])('shows %s as an unreadable closed form and still reads the open one', async (_, record) => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { record });

		const view = await loadDa6View(ctx, { typeId: SD, month: '2026-10', today: TODAY });

		expect(view.sheets.map(({ formId, from, to, segment }) => [formId, from, to, segment === null])).toEqual([
			['sd-closed', '2026-10-01', '2026-10-10', true],
			['sd-open', '2026-10-11', null, false]
		]);
		expect(gridLines(view.sheets[1].segment!)).toEqual(['SGT Pike *4 1 *2', 'SPC Kim 6 *7 1']);
	});

	it('closes the To field on the month’s last day once the month has passed', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		const view = await loadDa6View(ctx, { typeId: SD, month: '2026-10', today: '2026-11-02' });

		expect(view.sheets[1].to).toBe('2026-10-31');
	});

	it('refuses a Group-scoped Calendar viewer, whose pool would be partial', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP] },
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		seed(ctx);

		await expect(loadDa6View(ctx, { typeId: SD, month: '2026-10', today: TODAY })).rejects.toMatchObject({
			status: 403
		});
	});

	it('has no DA 6 for a Group-assigned type', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx);

		await expect(loadDa6View(ctx, { typeId: SHIFT, month: '2026-10', today: TODAY })).rejects.toMatchObject({
			status: 404
		});
	});

	it('reads a month with the same queries however many people and duty days it holds', async () => {
		const reads = async (people: number, days: string[]) => {
			const ctx = createWriteWithNotificationsPortsContext();
			seed(ctx, { people, days });
			let count = 0;
			for (const port of [
				ctx.calendarCatalogs,
				ctx.calendarAssignments,
				ctx.calendarAvailability,
				ctx.personnelCalendarRoster
			]) {
				for (const [name, method] of Object.entries(port)) {
					if (typeof method !== 'function') continue;
					(port as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
						count += 1;
						return method.apply(port, args);
					};
				}
			}
			const view = await loadDa6View(ctx, { typeId: SD, month: '2026-10', today: TODAY });
			return { count, rows: view.sheets[1].segment!.rows.length, columns: view.sheets[1].segment!.columns.length };
		};
		const october = (from: number, through: number) =>
			Array.from({ length: through - from + 1 }, (_, index) => `2026-10-${String(from + index).padStart(2, '0')}`);

		const small = await reads(2, october(11, 13));
		const large = await reads(40, october(11, 31));

		expect([small.rows, small.columns, large.rows, large.columns]).toEqual([2, 3, 40, 21]);
		expect(large.count).toBe(small.count);
	});
});
