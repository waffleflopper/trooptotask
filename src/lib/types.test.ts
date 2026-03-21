import { describe, it, expect } from 'vitest';
import type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
import { DEFAULT_STATUS_TYPES } from '$lib/types';

describe('shared calendar types in lib/types', () => {
	it('exports StatusType interface', () => {
		const st: StatusType = {
			id: '1',
			name: 'Leave',
			color: '#48bb78',
			textColor: '#ffffff'
		};
		expect(st.id).toBe('1');
		expect(st.name).toBe('Leave');
	});

	it('exports AvailabilityEntry interface', () => {
		const ae: AvailabilityEntry = {
			id: '1',
			personnelId: 'p1',
			statusTypeId: 'st1',
			startDate: '2026-01-01',
			endDate: '2026-01-05',
			note: 'test'
		};
		expect(ae.personnelId).toBe('p1');
	});

	it('exports SpecialDay interface', () => {
		const sd: SpecialDay = {
			id: '1',
			date: '2026-07-04',
			name: 'Independence Day',
			type: 'federal-holiday'
		};
		expect(sd.type).toBe('federal-holiday');
	});

	it('exports AssignmentType interface', () => {
		const at: AssignmentType = {
			id: '1',
			name: 'Guard Duty',
			shortName: 'GD',
			assignTo: 'personnel',
			color: '#ff0000',
			exemptPersonnelIds: []
		};
		expect(at.assignTo).toBe('personnel');
	});

	it('exports DailyAssignment interface', () => {
		const da: DailyAssignment = {
			id: '1',
			date: '2026-01-01',
			assignmentTypeId: 'at1',
			assigneeId: 'p1'
		};
		expect(da.assigneeId).toBe('p1');
	});

	it('exports DEFAULT_STATUS_TYPES constant', () => {
		expect(DEFAULT_STATUS_TYPES).toBeDefined();
		expect(Array.isArray(DEFAULT_STATUS_TYPES)).toBe(true);
		expect(DEFAULT_STATUS_TYPES.length).toBeGreaterThan(0);
		expect(DEFAULT_STATUS_TYPES[0]).toHaveProperty('name');
		expect(DEFAULT_STATUS_TYPES[0]).toHaveProperty('color');
	});
});
