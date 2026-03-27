import { describe, it, expect } from 'vitest';
import { computeTodayBreakdownData } from './todayBreakdownData';
import type { Personnel, AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const p1: Personnel = {
	id: 'p1',
	firstName: 'Alice',
	lastName: 'Smith',
	rank: 'SGT',
	groupId: 'g1',
	groupName: '1st PLT',
	clinicRole: '',
	mos: ''
};
const p2: Personnel = {
	id: 'p2',
	firstName: 'Bob',
	lastName: 'Jones',
	rank: 'SSG',
	groupId: 'g1',
	groupName: '1st PLT',
	clinicRole: '',
	mos: ''
};
const p3: Personnel = {
	id: 'p3',
	firstName: 'Carol',
	lastName: 'Doe',
	rank: 'SPC',
	groupId: 'g2',
	groupName: '2nd PLT',
	clinicRole: '',
	mos: ''
};
const p4: Personnel = {
	id: 'p4',
	firstName: 'Dan',
	lastName: 'Ray',
	rank: 'PFC',
	groupId: 'g2',
	groupName: '2nd PLT',
	clinicRole: '',
	mos: ''
};

const personnelByGroup = [
	{ group: '1st PLT', personnel: [p1, p2] },
	{ group: '2nd PLT', personnel: [p3, p4] }
];

const leaveStatus: StatusType = { id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#fff' };
const tdyStatus: StatusType = { id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#fff' };
const statusTypes = [leaveStatus, tdyStatus];

const cqType: AssignmentType = {
	id: 'at1',
	name: 'CQ',
	shortName: 'CQ',
	assignTo: 'personnel',
	color: '#000',
	exemptPersonnelIds: [],
	showInDateHeader: false
};
const sdType: AssignmentType = {
	id: 'at2',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#000',
	exemptPersonnelIds: [],
	showInDateHeader: false
};
const unitType: AssignmentType = {
	id: 'at3',
	name: 'Unit Detail',
	shortName: 'UD',
	assignTo: 'group',
	color: '#000',
	exemptPersonnelIds: [],
	showInDateHeader: false
};
const assignmentTypes = [cqType, sdType, unitType];

const TODAY = '2026-03-25';
const TOMORROW = '2026-03-26';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeTodayBreakdownData', () => {
	describe('totalCount', () => {
		it('sums personnel across all groups', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			expect(result.totalCount).toBe(4);
		});

		it('returns 0 when there are no groups', () => {
			const result = computeTodayBreakdownData(TODAY, [], [], statusTypes, [], []);
			expect(result.totalCount).toBe(0);
		});
	});

	describe('presentCount', () => {
		it('equals totalCount when no one has a status today', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			expect(result.presentCount).toBe(4);
		});

		it('decreases by the number of personnel with an active status today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-20', endDate: '2026-03-27' },
				{ id: 'e2', personnelId: 'p3', statusTypeId: 'tdy', startDate: TODAY, endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			expect(result.presentCount).toBe(2);
		});

		it('counts a person with multiple statuses only once as absent', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: TODAY, endDate: TODAY },
				{ id: 'e2', personnelId: 'p1', statusTypeId: 'tdy', startDate: TODAY, endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			expect(result.presentCount).toBe(3);
		});

		it('ignores entries that do not cover today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-01', endDate: '2026-03-24' },
				{ id: 'e2', personnelId: 'p2', statusTypeId: 'tdy', startDate: '2026-03-26', endDate: '2026-03-30' }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			expect(result.presentCount).toBe(4);
		});
	});

	describe('statusCounts', () => {
		it('returns empty array when no one has a status today', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			expect(result.statusCounts).toHaveLength(0);
		});

		it('counts personnel per status type for today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: TODAY, endDate: TODAY },
				{ id: 'e2', personnelId: 'p2', statusTypeId: 'leave', startDate: TODAY, endDate: TODAY },
				{ id: 'e3', personnelId: 'p3', statusTypeId: 'tdy', startDate: TODAY, endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			const leaveCount = result.statusCounts.find((s) => s.statusType.id === 'leave');
			const tdyCount = result.statusCounts.find((s) => s.statusType.id === 'tdy');
			expect(leaveCount?.count).toBe(2);
			expect(tdyCount?.count).toBe(1);
		});

		it('omits status types with zero personnel today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: TODAY, endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			const tdyCount = result.statusCounts.find((s) => s.statusType.id === 'tdy');
			expect(tdyCount).toBeUndefined();
		});
	});

	describe('assignmentCoverage', () => {
		it('returns one entry per assignment type', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, assignmentTypes, []);
			expect(result.assignmentCoverage).toHaveLength(3);
		});

		it('marks unassigned types as not assigned', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, assignmentTypes, []);
			expect(result.assignmentCoverage.every((a) => !a.isAssigned)).toBe(true);
		});

		it('shows "RANK LastName" for personnel assignments', () => {
			const assignments: DailyAssignment[] = [{ id: 'da1', date: TODAY, assignmentTypeId: 'at1', assigneeId: 'p1' }];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, assignmentTypes, assignments);
			const cq = result.assignmentCoverage.find((a) => a.type.id === 'at1');
			expect(cq?.isAssigned).toBe(true);
			expect(cq?.assigneeName).toBe('SGT Smith');
		});

		it('shows group name for group assignments', () => {
			const assignments: DailyAssignment[] = [
				{ id: 'da2', date: TODAY, assignmentTypeId: 'at3', assigneeId: '1st PLT' }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, assignmentTypes, assignments);
			const ud = result.assignmentCoverage.find((a) => a.type.id === 'at3');
			expect(ud?.isAssigned).toBe(true);
			expect(ud?.assigneeName).toBe('1st PLT');
		});

		it('ignores assignments for other dates', () => {
			const assignments: DailyAssignment[] = [{ id: 'da1', date: TOMORROW, assignmentTypeId: 'at1', assigneeId: 'p1' }];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, assignmentTypes, assignments);
			const cq = result.assignmentCoverage.find((a) => a.type.id === 'at1');
			expect(cq?.isAssigned).toBe(false);
		});

		it('returns empty array when there are no assignment types', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			expect(result.assignmentCoverage).toHaveLength(0);
		});
	});

	describe('gaps', () => {
		it('lists a gap for each unassigned type today', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [cqType, sdType], []);
			expect(result.gaps).toContain('No CQ assigned today');
			expect(result.gaps).toContain('No SD assigned today');
		});

		it('does not list a gap for an assigned type', () => {
			const assignments: DailyAssignment[] = [{ id: 'da1', date: TODAY, assignmentTypeId: 'at1', assigneeId: 'p1' }];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [cqType, sdType], assignments);
			expect(result.gaps).not.toContain('No CQ assigned today');
			expect(result.gaps).toContain('No SD assigned today');
		});

		it('includes expiring status count when statuses expire today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-20', endDate: TODAY },
				{ id: 'e2', personnelId: 'p2', statusTypeId: 'tdy', startDate: '2026-03-21', endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			expect(result.gaps).toContain('2 statuses expire today');
		});

		it('uses singular "status" when only one expires today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-20', endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			expect(result.gaps).toContain('1 status expires today');
		});

		it('does not include expiring message when no statuses expire today', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: TODAY, endDate: TOMORROW }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			const expiryGap = result.gaps.find((g) => g.includes('expire'));
			expect(expiryGap).toBeUndefined();
		});

		it('returns empty array when everything is assigned and nothing expires', () => {
			const assignments: DailyAssignment[] = [{ id: 'da1', date: TODAY, assignmentTypeId: 'at1', assigneeId: 'p1' }];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [cqType], assignments);
			expect(result.gaps).toHaveLength(0);
		});
	});

	describe('groupStrength', () => {
		it('returns one entry per group', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			expect(result.groupStrength).toHaveLength(2);
		});

		it('shows correct total per group', () => {
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, [], statusTypes, [], []);
			const plt1 = result.groupStrength.find((g) => g.group === '1st PLT');
			const plt2 = result.groupStrength.find((g) => g.group === '2nd PLT');
			expect(plt1?.total).toBe(2);
			expect(plt2?.total).toBe(2);
		});

		it('shows correct present count per group', () => {
			const entries: AvailabilityEntry[] = [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: TODAY, endDate: TODAY }
			];
			const result = computeTodayBreakdownData(TODAY, personnelByGroup, entries, statusTypes, [], []);
			const plt1 = result.groupStrength.find((g) => g.group === '1st PLT');
			const plt2 = result.groupStrength.find((g) => g.group === '2nd PLT');
			expect(plt1?.present).toBe(1);
			expect(plt2?.present).toBe(2);
		});

		it('returns empty array when there are no groups', () => {
			const result = computeTodayBreakdownData(TODAY, [], [], statusTypes, [], []);
			expect(result.groupStrength).toHaveLength(0);
		});
	});
});
