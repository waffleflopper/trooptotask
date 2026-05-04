import { describe, expect, it } from 'vitest';
import { buildDutyRosterTemplatePreview } from './dutyRosterTemplatePreview';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';
import type { StatusType } from '$lib/types';

const statusTypes: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'other-duty',
		name: 'Other Duty',
		color: '#a0522d',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'other-duty',
		da6TreatmentReviewed: true
	},
	{
		id: 'misconduct',
		name: 'Misconduct',
		color: '#991b1b',
		textColor: '#ffffff',
		da6AvailabilityTreatment: 'misconduct-unavailable',
		da6TreatmentReviewed: true
	}
];

const template: DutyRosterTemplate = {
	id: 'template-1',
	name: 'CQ NCO',
	slug: 'cq-nco',
	shortCode: 'CQ',
	status: 'active',
	poolCriteria: {
		rankValues: [],
		groupIds: [],
		mosValues: [],
		dutyRoleValues: []
	},
	exemptPersonnelIds: [],
	manualBaselineCounts: {},
	createdAt: '2026-05-04T00:00:00.000Z',
	updatedAt: '2026-05-04T00:00:00.000Z'
};

function person(overrides: Partial<DutyRosterPoolPersonnel>): DutyRosterPoolPersonnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Soldier',
		firstName: overrides.firstName ?? 'Sam',
		mos: overrides.mos ?? '11B',
		dutyRole: overrides.dutyRole ?? 'Rifleman',
		groupId: overrides.groupId ?? 'alpha',
		groupName: overrides.groupName ?? 'Alpha',
		archivedAt: overrides.archivedAt ?? null
	};
}

describe('buildDutyRosterTemplatePreview', () => {
	it('starts a new roster from DA6 roster order when there is no baseline or accepted history', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'junior', rank: 'SPC', lastName: 'Able' }),
				person({ id: 'senior-b', rank: 'SSG', lastName: 'Baker' }),
				person({ id: 'senior-a', rank: 'SSG', lastName: 'Able' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-03'
		});

		expect(preview.da6.rows.map((row) => row.personnelId)).toEqual(['senior-a', 'senior-b', 'junior']);
		expect(preview.rosterRows.map((row) => row.assigneeId)).toEqual(['senior-a', 'senior-b', 'junior']);
	});

	it('uses Manual DA6 Baseline counts as first-use setup data for longest-break ranking', () => {
		const preview = buildDutyRosterTemplatePreview({
			template: {
				...template,
				manualBaselineCounts: {
					alpha: 3,
					bravo: 0,
					charlie: 1
				}
			},
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
				person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' })
			],
			availabilityEntries: [],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(preview.rosterRows[0].assigneeId).toBe('bravo');
	});

	it('keeps preview generation read-only while showing A, D, and future U matrix markings', () => {
		const preview = buildDutyRosterTemplatePreview({
			template,
			personnel: [
				person({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
				person({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
				person({ id: 'charlie', rank: 'SGT', lastName: 'Charlie' }),
				person({ id: 'delta', rank: 'SGT', lastName: 'Delta' })
			],
			availabilityEntries: [
				{
					id: 'leave-alpha',
					personnelId: 'alpha',
					statusTypeId: 'leave',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				},
				{
					id: 'detail-bravo',
					personnelId: 'bravo',
					statusTypeId: 'other-duty',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				},
				{
					id: 'misconduct-charlie',
					personnelId: 'charlie',
					statusTypeId: 'misconduct',
					startDate: '2026-06-01',
					endDate: '2026-06-01'
				}
			],
			statusTypes,
			specialDays: [],
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(preview.rosterRows[0].assigneeId).toBe('delta');
		expect(preview.da6.rows.map((row) => row.cells[0].da6Code)).toEqual(['A', 'D', 'U', null]);
		expect(Object.isFrozen(preview)).toBe(true);
	});
});
