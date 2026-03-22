import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000099';

const mockCalendarData = {
	availabilityEntries: [
		{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
	],
	specialDays: [{ id: 'sd1', date: '2026-01-01', name: 'New Year', type: 'federal-holiday' }],
	assignmentTypes: [
		{ id: 'at1', name: 'CQ', shortName: 'CQ', assignTo: 'personnel', color: '#ef4444', exemptPersonnelIds: [] }
	],
	dailyAssignments: [{ id: 'da1', date: '2026-03-01', assignmentTypeId: 'at1', assigneeId: 'p1' }],
	pinnedGroups: ['Alpha'],
	rosterHistory: [
		{
			id: 'rh1',
			assignmentTypeId: 'at1',
			name: 'CQ Roster',
			startDate: '2026-03-01',
			endDate: '2026-03-31',
			roster: [],
			config: {},
			createdAt: '2026-03-01T00:00:00Z'
		}
	]
};

const mockFetchCalendarData = vi.fn();

vi.mock('$lib/server/calendarData', () => ({
	fetchCalendarData: (...args: unknown[]) => mockFetchCalendarData(...args)
}));

vi.mock('$lib/server/supabase', () => ({
	getSupabaseClient: () => ({})
}));

describe('calendar layout server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchCalendarData.mockResolvedValue(mockCalendarData);
	});

	it('returns all calendar data fields from fetchCalendarData', async () => {
		const { load } = await import('../../routes/org/[orgId]/calendar/+layout.server');

		const dependsKeys: string[] = [];
		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: USER_ID } },
			cookies: {},
			depends: (key: string) => dependsKeys.push(key)
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit load return type doesn't expose layout data shape in tests
		const data = result as any;
		expect(mockFetchCalendarData).toHaveBeenCalledWith(expect.anything(), ORG_ID, USER_ID);
		expect(data.availabilityEntries).toEqual(mockCalendarData.availabilityEntries);
		expect(data.specialDays).toEqual(mockCalendarData.specialDays);
		expect(data.assignmentTypes).toEqual(mockCalendarData.assignmentTypes);
		expect(data.dailyAssignments).toEqual(mockCalendarData.dailyAssignments);
		expect(data.pinnedGroups).toEqual(mockCalendarData.pinnedGroups);
		expect(data.rosterHistory).toEqual(mockCalendarData.rosterHistory);
		expect(dependsKeys).toContain('app:calendar-data');
	});
});
