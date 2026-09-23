import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCalendarBootstrap, fetchCalendarData, fetchCalendarRangeData } from './calendarQuery';
import { updateDailyAssignment } from './dailyAssignments';

const range = { rangeStart: '2026-03-01', rangeEnd: '2026-03-31' };

// Independent R6 facts: no duty run/template is needed to read these saved slots.
// The edited slot was generated for p-alpha, but its saved assignee is now p-bravo.
const savedSlots = [
	{
		id: 'manual-person',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignment_type_id: 'person-type',
		assignee_id: 'p-alpha'
	},
	{
		id: 'manual-group',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignment_type_id: 'group-type',
		assignee_id: 'g-bravo'
	},
	{
		id: 'linked',
		organization_id: 'test-org',
		date: '2026-03-15',
		assignment_type_id: 'person-type',
		assignee_id: 'p-alpha'
	},
	{
		id: 'edited-generated',
		organization_id: 'test-org',
		date: '2026-03-31',
		assignment_type_id: 'person-type',
		assignee_id: 'p-bravo'
	},
	{
		id: 'outside-window',
		organization_id: 'test-org',
		date: '2026-04-01',
		assignment_type_id: 'person-type',
		assignee_id: 'p-alpha'
	},
	{
		id: 'outside-group',
		organization_id: 'test-org',
		date: '2026-03-02',
		assignment_type_id: 'person-type',
		assignee_id: 'p-charlie'
	},
	{
		id: 'outside-group-slot',
		organization_id: 'test-org',
		date: '2026-03-02',
		assignment_type_id: 'group-type',
		assignee_id: 'g-charlie'
	},
	{
		id: 'other-org',
		organization_id: 'other-org',
		date: '2026-03-01',
		assignment_type_id: 'person-type',
		assignee_id: 'p-other'
	}
];

const retainedSlots = [
	{
		id: 'manual-person',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignmentTypeId: 'person-type',
		assigneeId: 'p-alpha'
	},
	{
		id: 'manual-group',
		organization_id: 'test-org',
		date: '2026-03-01',
		assignmentTypeId: 'group-type',
		assigneeId: 'g-bravo'
	},
	{
		id: 'linked',
		organization_id: 'test-org',
		date: '2026-03-15',
		assignmentTypeId: 'person-type',
		assigneeId: 'p-alpha'
	},
	{
		id: 'edited-generated',
		organization_id: 'test-org',
		date: '2026-03-31',
		assignmentTypeId: 'person-type',
		assigneeId: 'p-bravo'
	}
];

function fixture() {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: ['g-alpha', 'g-bravo'] }
		}
	});
	ctx.rawStore.seed('groups', [
		{ id: 'g-alpha', organization_id: 'test-org', name: 'Alpha' },
		{ id: 'g-bravo', organization_id: 'test-org', name: 'Bravo' },
		{ id: 'g-charlie', organization_id: 'test-org', name: 'Charlie' }
	]);
	ctx.rawStore.seed(
		'personnel',
		['alpha', 'bravo', 'charlie'].map((name) => ({
			id: `p-${name}`,
			organization_id: 'test-org',
			group_id: `g-${name}`,
			first_name: name,
			last_name: 'Synthetic',
			rank: 'SGT',
			clinic_role: 'Medic',
			archived_at: null
		}))
	);
	ctx.rawStore.seed('assignment_types', [
		{
			id: 'person-type',
			organization_id: 'test-org',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#123456'
		},
		{
			id: 'group-type',
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
	] as const)('%s retains scoped manual person/Group, linked and edited slots', async (_name, query) => {
		const ctx = fixture();
		const result = await query(ctx, range);
		expect(await result.dailyAssignments).toEqual(retainedSlots);
		// Reading cannot rewrite a generated fact or delete an out-of-scope fact.
		expect(await ctx.rawStore.findMany('daily_assignments', 'test-org')).toEqual(savedSlots.slice(0, 7));
		expect(await ctx.rawStore.findMany('daily_assignments', 'other-org')).toEqual([savedSlots[7]]);
	});

	it('keeps referenced types and Personnel Duty Role available', async () => {
		const result = await fetchCalendarBootstrap(fixture(), range);
		expect(result.assignmentTypes).toEqual([
			expect.objectContaining({ id: 'person-type', name: 'Staff Duty', assignTo: 'personnel' }),
			expect.objectContaining({ id: 'group-type', name: 'Detail', assignTo: 'group' })
		]);
		expect(result.personnel.map(({ id, clinicRole }) => ({ id, clinicRole }))).toEqual([
			{ id: 'p-alpha', clinicRole: 'Medic' },
			{ id: 'p-bravo', clinicRole: 'Medic' }
		]);
	});

	it('edits a generated assignment in place and reloads its saved assignee with an identity-specific audit', async () => {
		const ctx = fixture();
		await updateDailyAssignment(ctx, { id: 'linked', assigneeId: 'p-bravo' });
		const result = await fetchCalendarRangeData(ctx, range);
		expect(result.dailyAssignments).toEqual([
			retainedSlots[0],
			retainedSlots[1],
			{
				id: 'linked',
				organization_id: 'test-org',
				date: '2026-03-15',
				assignmentTypeId: 'person-type',
				assigneeId: 'p-bravo'
			},
			retainedSlots[3]
		]);
		expect(await ctx.rawStore.findMany('daily_assignments', 'test-org')).toEqual(
			savedSlots.slice(0, 7).map((row) => (row.id === 'linked' ? { ...row, assignee_id: 'p-bravo' } : row))
		);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'daily_assignment.updated',
				resourceType: 'daily_assignment',
				resourceId: 'linked'
			})
		]);
		expect(await ctx.rawStore.findMany('daily_assignments', 'other-org')).toEqual([savedSlots[7]]);
	});

	it('preserves generated facts and emits no success audit when a saved edit fails', async () => {
		const ctx = fixture();
		vi.spyOn(ctx.store, 'update').mockRejectedValueOnce(new Error('synthetic write failure'));
		await expect(updateDailyAssignment(ctx, { id: 'linked', assigneeId: 'p-bravo' })).rejects.toThrow(
			'synthetic write failure'
		);
		expect((await fetchCalendarRangeData(ctx, range)).dailyAssignments).toEqual(retainedSlots);
		expect(await ctx.rawStore.findMany('daily_assignments', 'test-org')).toEqual(savedSlots.slice(0, 7));
		expect(ctx.auditPort.events).toEqual([]);
	});
});
