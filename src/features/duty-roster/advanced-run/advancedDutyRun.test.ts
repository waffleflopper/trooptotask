import { describe, expect, it } from 'vitest';
import { buildAdvancedRunSnapshot } from './advancedDutyRun';
import type { DutyTemplate } from '../duty-roster.types';
import type { Personnel } from '$lib/types';

const template: DutyTemplate = {
	id: 'template-staff-duty',
	orgId: 'org-1',
	mode: 'advanced',
	status: 'active',
	name: 'Staff Duty',
	description: null,
	scopeType: 'groups',
	scopeGroupIds: ['group-hq'],
	exemptPersonnelIds: [],
	exemptStatusTypeIds: [],
	coverageMode: 'timed',
	startTime: '08:00',
	endTime: '20:00',
	spansMidnight: false,
	isBlocking: true,
	cooldownHours: 0,
	softPreferences: [],
	createdAt: '2026-04-01T00:00:00.000Z',
	updatedAt: '2026-04-01T00:00:00.000Z',
	rotationBaselines: [],
	slots: [
		{
			id: 'slot-general',
			templateId: 'template-staff-duty',
			roleLabel: 'General',
			quantity: 1,
			allowedRanks: [],
			allowedGroupIds: [],
			preferredGroupIds: [],
			allowedMosValues: [],
			allowedRoleValues: [],
			rotationPoolKey: 'general',
			sortOrder: 0
		},
		{
			id: 'slot-nco',
			templateId: 'template-staff-duty',
			roleLabel: 'NCO',
			quantity: 1,
			allowedRanks: ['SGT'],
			allowedGroupIds: [],
			preferredGroupIds: [],
			allowedMosValues: [],
			allowedRoleValues: ['Squad Leader'],
			rotationPoolKey: 'nco',
			sortOrder: 1
		}
	]
};

const personnel: Personnel[] = [
	{
		id: 'person-nco',
		rank: 'SGT',
		lastName: 'Nolan',
		firstName: 'Casey',
		mos: '11B',
		clinicRole: 'Squad Leader',
		groupId: 'group-hq',
		groupName: 'Headquarters'
	},
	{
		id: 'person-baker',
		rank: 'SPC',
		lastName: 'Baker',
		firstName: 'Jordan',
		mos: '11B',
		clinicRole: 'Driver',
		groupId: 'group-hq',
		groupName: 'Headquarters'
	},
	{
		id: 'person-chen',
		rank: 'PFC',
		lastName: 'Chen',
		firstName: 'Alex',
		mos: '11B',
		clinicRole: 'Rifleman',
		groupId: 'group-hq',
		groupName: 'Headquarters'
	}
];

describe('advanced duty run snapshots', () => {
	it('builds a snapshot from resolved inputs while preserving hardest-slot-first proposals', async () => {
		const snapshot = await buildAdvancedRunSnapshot({
			template,
			eventDates: ['2026-04-10'],
			personnel,
			holidayClosureDates: new Set(),
			historyEvents: [],
			statusExemptPersonnelDatesByEventDate: new Map()
		});

		expect(snapshot).toMatchObject({
			snapshotVersion: 1,
			templateId: template.id,
			templateName: 'Staff Duty',
			eventDates: ['2026-04-10'],
			candidatePersonnelIds: []
		});
		expect(snapshot.template.rulesSnapshot.slots).toEqual([
			expect.objectContaining({ templateSlotId: 'slot-general', roleLabel: 'General' }),
			expect.objectContaining({ templateSlotId: 'slot-nco', roleLabel: 'NCO' })
		]);
		expect(snapshot.personnel).toEqual([
			expect.objectContaining({ id: 'person-nco', displayName: 'SGT Nolan, Casey' }),
			expect.objectContaining({ id: 'person-baker', displayName: 'SPC Baker, Jordan' }),
			expect.objectContaining({ id: 'person-chen', displayName: 'PFC Chen, Alex' })
		]);

		const event = snapshot.events[0];
		expect(event.preview.fillSummary).toEqual({ totalSlots: 2, filledSlots: 2, unfilledSlots: 0 });
		expect(event.slotProposals[0]).toMatchObject({
			roleLabel: 'General',
			assigneeId: expect.not.stringMatching('person-nco')
		});
		expect(event.slotProposals[1]).toMatchObject({
			roleLabel: 'NCO',
			assigneeId: 'person-nco'
		});
	});

	it('uses earlier dates in the same run snapshot as transient fairness history', async () => {
		const cqTemplate: DutyTemplate = {
			...template,
			name: 'Company CQ',
			slots: [
				{
					id: 'slot-cq',
					templateId: template.id,
					roleLabel: 'CQ',
					quantity: 2,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					preferredGroupIds: [],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'cq',
					sortOrder: 0
				}
			]
		};
		const cqPersonnel: Personnel[] = [
			...personnel.slice(0, 1),
			{
				id: 'person-adams',
				rank: 'SGT',
				lastName: 'Adams',
				firstName: 'Alex',
				mos: '11B',
				clinicRole: 'Squad Leader',
				groupId: 'group-hq',
				groupName: 'Headquarters'
			},
			{
				id: 'person-baker-sgt',
				rank: 'SGT',
				lastName: 'Baker',
				firstName: 'Blair',
				mos: '11B',
				clinicRole: 'Squad Leader',
				groupId: 'group-hq',
				groupName: 'Headquarters'
			},
			{
				id: 'person-davis',
				rank: 'SGT',
				lastName: 'Davis',
				firstName: 'Drew',
				mos: '11B',
				clinicRole: 'Squad Leader',
				groupId: 'group-hq',
				groupName: 'Headquarters'
			}
		];

		const snapshot = await buildAdvancedRunSnapshot({
			template: cqTemplate,
			eventDates: ['2026-04-10', '2026-04-11'],
			personnel: cqPersonnel,
			holidayClosureDates: new Set(),
			historyEvents: [],
			statusExemptPersonnelDatesByEventDate: new Map()
		});

		const dayOneAssignees = snapshot.events[0].slotProposals
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);
		const dayTwoAssignees = snapshot.events[1].slotProposals
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);

		expect(dayOneAssignees).toHaveLength(2);
		expect(dayTwoAssignees).toHaveLength(2);
		for (const assigneeId of dayOneAssignees) {
			expect(dayTwoAssignees).not.toContain(assigneeId);
		}
	});
});
