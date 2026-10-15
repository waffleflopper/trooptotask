import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from './calendarPersistence.test-support.server';
import { fetchCalendarBootstrap, fetchCalendarData, fetchCalendarRangeData } from '$features/calendar/index.server';
import { setDailyAssignmentSlot } from './dailyAssignmentOperations.server';

const PERSON_TYPE = '00000000-0000-4000-8000-000000000010';
const GROUP_TYPE = '00000000-0000-4000-8000-000000000011';
const P_ALPHA = '00000000-0000-4000-8000-000000000012';
const P_BRAVO = '00000000-0000-4000-8000-000000000013';
const P_CHARLIE = '00000000-0000-4000-8000-000000000014';
const P_OTHER = '00000000-0000-4000-8000-000000000015';
const G_ALPHA = '00000000-0000-4000-8000-000000000016';
const G_BRAVO = '00000000-0000-4000-8000-000000000017';
const G_CHARLIE = '00000000-0000-4000-8000-000000000018';

const range = { rangeStart: '2026-03-01', rangeEnd: '2026-03-31' };

// Independent R6 facts: no duty run/template is needed to read these saved slots.
// The edited slot was generated for p-alpha, but its saved assignee is now p-bravo.
const savedSlots = [
	{
		id: 'manual-person',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_ALPHA
	},
	{
		id: 'manual-group',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignment_type_id: GROUP_TYPE,
		assignee_id: G_BRAVO
	},
	{
		id: 'linked',
		organization_id: 'test-org',
		date: '2026-03-15',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_ALPHA
	},
	{
		id: 'edited-generated',
		organization_id: 'test-org',
		date: '2026-03-31',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_BRAVO
	},
	{
		id: 'outside-window',
		organization_id: 'test-org',
		date: '2026-04-01',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_ALPHA
	},
	{
		id: 'outside-group',
		organization_id: 'test-org',
		date: '2026-03-02',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_CHARLIE
	},
	{
		id: 'outside-group-slot',
		organization_id: 'test-org',
		date: '2026-03-02',
		assignment_type_id: GROUP_TYPE,
		assignee_id: G_CHARLIE
	},
	{
		id: 'other-org',
		organization_id: 'other-org',
		date: '2026-03-01',
		assignment_type_id: PERSON_TYPE,
		assignee_id: P_OTHER
	}
];

const retainedSlots = [
	{
		id: 'manual-person',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignmentTypeId: PERSON_TYPE,
		assigneeId: P_ALPHA
	},
	{
		id: 'manual-group',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignmentTypeId: GROUP_TYPE,
		assigneeId: G_BRAVO
	},
	{
		id: 'linked',
		organization_id: 'test-org',
		date: '2026-03-15',
		assignmentTypeId: PERSON_TYPE,
		assigneeId: P_ALPHA
	},
	{
		id: 'edited-generated',
		organization_id: 'test-org',
		date: '2026-03-31',
		assignmentTypeId: PERSON_TYPE,
		assigneeId: P_BRAVO
	}
];

function fixture() {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: [G_ALPHA, G_BRAVO] }
		}
	});
	ctx.rawStore.seed('groups', [
		{ id: G_ALPHA, organization_id: 'test-org', name: 'Alpha' },
		{ id: G_BRAVO, organization_id: 'test-org', name: 'Bravo' },
		{ id: G_CHARLIE, organization_id: 'test-org', name: 'Charlie' }
	]);
	ctx.rawStore.seed(
		'personnel',
		(
			[
				['alpha', P_ALPHA, G_ALPHA],
				['bravo', P_BRAVO, G_BRAVO],
				['charlie', P_CHARLIE, G_CHARLIE]
			] as const
		).map(([name, id, groupId]) => ({
			id,
			organization_id: 'test-org',
			group_id: groupId,
			first_name: name,
			last_name: 'Synthetic',
			rank: 'SGT',
			clinic_role: 'Medic',
			archived_at: null
		}))
	);
	ctx.rawStore.seed('assignment_types', [
		{
			id: PERSON_TYPE,
			organization_id: 'test-org',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#123456'
		},
		{
			id: GROUP_TYPE,
			organization_id: 'test-org',
			name: 'Detail',
			short_name: 'DT',
			assign_to: 'group',
			color: '#654321'
		}
	]);
	ctx.rawStore.seed('daily_assignments', structuredClone(savedSlots));
	return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('persisted Calendar preservation (R1/R6)', () => {
	it.each([
		['page', fetchCalendarData],
		['range', fetchCalendarRangeData],
		['bootstrap', fetchCalendarBootstrap]
	] as const)('%s retains scoped saved slots with retired Duty storage unavailable', async (_name, query) => {
		const ctx = fixture();
		const findMany = ctx.store.findMany.bind(ctx.store);
		const retiredReads: string[] = [];
		vi.spyOn(ctx.store, 'findMany').mockImplementation((table, ...args) => {
			if (table.startsWith('duty_') || table.startsWith('advanced_duty_')) {
				retiredReads.push(table);
				throw new Error('Retired Duty storage is unavailable');
			}
			return findMany(table, ...args);
		});
		const result = await query(ctx, range);
		expect(await result.dailyAssignments).toEqual(retainedSlots);
		// Reading cannot rewrite a generated fact or delete an out-of-scope fact.
		expect(await ctx.rawStore.findMany('daily_assignments', 'test-org')).toEqual(savedSlots.slice(0, 7));
		expect(await ctx.rawStore.findMany('daily_assignments', 'other-org')).toEqual([savedSlots[7]]);
		expect(retiredReads).toEqual([]);
	});

	it('keeps referenced types and Personnel Duty Role available', async () => {
		const result = await fetchCalendarBootstrap(fixture(), range);
		expect(result.assignmentTypes).toEqual([
			expect.objectContaining({ id: PERSON_TYPE, name: 'Staff Duty', assignTo: 'personnel' }),
			expect.objectContaining({ id: GROUP_TYPE, name: 'Detail', assignTo: 'group' })
		]);
		expect(result.personnel.map(({ id, clinicRole }) => ({ id, clinicRole }))).toEqual([
			{ id: P_ALPHA, clinicRole: 'Medic' },
			{ id: P_BRAVO, clinicRole: 'Medic' }
		]);
	});

	it('reassigns a saved generated slot and reloads it without changing neighboring or foreign facts', async () => {
		const ctx = fixture();
		await setDailyAssignmentSlot(ctx, {
			date: '2026-03-15',
			assignmentTypeId: PERSON_TYPE,
			assigneeId: P_BRAVO
		});
		const saved = await ctx.rawStore.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(saved).toHaveLength(7);
		expect(saved.filter((row) => row.date !== '2026-03-15')).toEqual(
			savedSlots.slice(0, 7).filter((row) => row.date !== '2026-03-15')
		);
		const edited = saved.find((row) => row.date === '2026-03-15');
		expect(edited).toMatchObject({
			organization_id: 'test-org',
			date: '2026-03-15',
			assignment_type_id: PERSON_TYPE,
			assignee_id: P_BRAVO,
			id: expect.any(String)
		});
		const result = await fetchCalendarRangeData(ctx, range);
		expect(result.dailyAssignments).toHaveLength(4);
		expect(result.dailyAssignments).toEqual(
			expect.arrayContaining([
				retainedSlots[0],
				retainedSlots[1],
				retainedSlots[3],
				{
					id: edited?.id,
					organization_id: 'test-org',
					date: '2026-03-15',
					assignmentTypeId: PERSON_TYPE,
					assigneeId: P_BRAVO
				}
			])
		);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'daily_assignment.created',
				resourceType: 'daily_assignment',
				resourceId: edited?.id
			})
		);
		expect(await ctx.rawStore.findMany('daily_assignments', 'other-org')).toEqual([savedSlots[7]]);
	});

	it('preserves generated facts and emits no success audit when a saved edit fails', async () => {
		const ctx = fixture();
		vi.spyOn(ctx.calendarAssignmentReplacement, 'replace').mockRejectedValueOnce(new Error('synthetic write failure'));
		await expect(
			setDailyAssignmentSlot(ctx, {
				date: '2026-03-15',
				assignmentTypeId: PERSON_TYPE,
				assigneeId: P_BRAVO
			})
		).rejects.toThrow('synthetic write failure');
		expect((await fetchCalendarRangeData(ctx, range)).dailyAssignments).toEqual(retainedSlots);
		expect(await ctx.rawStore.findMany('daily_assignments', 'test-org')).toEqual(savedSlots.slice(0, 7));
		expect(ctx.auditPort.events).toEqual([]);
	});
});
