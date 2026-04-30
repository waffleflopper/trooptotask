import { describe, expect, it } from 'vitest';
import { buildAdvancedRunSnapshot } from './advancedDutyRun';
import type { DutyTemplate } from '../duty-roster.types';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';

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
			historyEvents: []
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
			historyEvents: []
		});

		const dayOneAssignees = snapshot.events[0].slotProposals
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);
		const dayTwoAssignees = snapshot.events[1].slotProposals
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);
		const dayOneSlots = snapshot.events[0].slotProposals;

		expect(dayOneAssignees).toHaveLength(2);
		expect(dayTwoAssignees).toHaveLength(2);
		expect(dayOneSlots[0].candidateRankings?.[0]).toEqual({
			personnelId: dayOneSlots[0].assigneeId,
			rank: 1
		});
		expect(dayOneSlots[0].candidateRankings?.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4]);
		expect(dayOneSlots[1].candidateRankings?.map((candidate) => candidate.personnelId)).not.toContain(
			dayOneSlots[0].assigneeId
		);
		for (const assigneeId of dayOneAssignees) {
			expect(dayTwoAssignees).not.toContain(assigneeId);
		}
	});

	it('captures shared status availability treatments without exposing DA6 labels in advanced previews', async () => {
		const statusTypes: StatusType[] = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#008000',
				textColor: '#ffffff',
				da6AvailabilityTreatment: 'authorized-absence'
			},
			{
				id: 'other-duty',
				name: 'Other Duty / Detail',
				color: '#a0522d',
				textColor: '#ffffff',
				da6AvailabilityTreatment: 'other-duty'
			}
		];
		const availabilityEntries: AvailabilityEntry[] = [
			{
				id: 'leave-nco',
				personnelId: 'person-nco',
				statusTypeId: 'leave',
				startDate: '2026-04-10',
				endDate: '2026-04-10'
			},
			{
				id: 'detail-baker',
				personnelId: 'person-baker',
				statusTypeId: 'other-duty',
				startDate: '2026-04-10',
				endDate: '2026-04-10'
			}
		];

		const snapshot = await buildAdvancedRunSnapshot({
			template,
			eventDates: ['2026-04-10'],
			personnel,
			holidayClosureDates: new Set(),
			historyEvents: [],
			availabilityEntries,
			statusTypes,
			misconductUnavailablePersonnelDates: { 'person-chen': ['2026-04-10'] }
		});

		const event = snapshot.events[0];

		expect(event.availabilityClassifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					personnelId: 'person-nco',
					reasonCode: 'authorized-absence',
					statusNames: ['Leave'],
					selectable: false,
					chargeable: false
				}),
				expect.objectContaining({
					personnelId: 'person-baker',
					reasonCode: 'other-duty-status',
					statusNames: ['Other Duty / Detail'],
					selectable: false,
					chargeable: true
				}),
				expect.objectContaining({
					personnelId: 'person-chen',
					reasonCode: 'misconduct-unavailable',
					selectable: false,
					chargeable: true
				})
			])
		);
		expect(event.preview.slotInstances.every((slot) => slot.assigneeId === null)).toBe(true);
		expect(event.preview.slotInstances[0].unfilledReason).toBe(
			'No eligible Soldier remained after availability and blocking checks.'
		);
		expect(JSON.stringify(event.preview)).not.toContain('"A"');
		expect(JSON.stringify(event.preview)).not.toContain('"D"');
		expect(JSON.stringify(event.preview)).not.toContain('"U"');
	});

	it('captures blocking advanced duty overlap and cooldown classifications in the preview snapshot', async () => {
		const snapshot = await buildAdvancedRunSnapshot({
			template,
			eventDates: ['2026-04-10'],
			personnel,
			holidayClosureDates: new Set(),
			historyEvents: [
				{
					id: 'event-overlap',
					eventDate: '2026-04-10',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-10T20:00:00',
					cooldownHours: 0,
					isBlocking: true,
					rulesSnapshot: {
						slots: [{ templateSlotId: 'slot-general', rotationPoolKey: 'general', blockingMode: 'inherit' }]
					},
					slotInstances: [{ templateSlotId: 'slot-general', assigneeId: 'person-baker' }]
				},
				{
					id: 'event-cooldown',
					eventDate: '2026-04-09',
					coverageStart: '2026-04-09T20:00:00',
					coverageEnd: '2026-04-10T07:00:00',
					cooldownHours: 2,
					isBlocking: true,
					rulesSnapshot: {
						slots: [{ templateSlotId: 'slot-general', rotationPoolKey: 'general', blockingMode: 'inherit' }]
					},
					slotInstances: [{ templateSlotId: 'slot-general', assigneeId: 'person-nco' }]
				}
			]
		});

		const event = snapshot.events[0];

		expect(event.availabilityClassifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					personnelId: 'person-baker',
					reasonCode: 'advanced-duty-overlap',
					selectable: false,
					chargeable: true
				}),
				expect.objectContaining({
					personnelId: 'person-nco',
					reasonCode: 'advanced-duty-cooldown',
					selectable: false,
					chargeable: true
				}),
				expect.objectContaining({
					personnelId: 'person-chen',
					selectable: true
				})
			])
		);
		expect(event.preview.slotInstances.map((slot) => slot.assigneeId)).toEqual(['person-chen', null]);
		expect(event.preview.slotInstances[1].unfilledReason).toBe(
			'No eligible Soldier remained after availability and blocking checks.'
		);
	});

	it('exposes a preview team duty packet export model for generated, overridden, locked, cleared, and unfilled slots', async () => {
		const packetTemplate: DutyTemplate = {
			...template,
			name: 'Battalion Staff Duty',
			slots: [
				{
					...template.slots[0],
					id: 'slot-generated',
					roleLabel: 'Generated Runner',
					rotationPoolKey: 'generated'
				},
				{
					...template.slots[0],
					id: 'slot-manual',
					roleLabel: 'Manual Runner',
					rotationPoolKey: 'manual'
				},
				{
					...template.slots[0],
					id: 'slot-locked',
					roleLabel: 'Locked Runner',
					rotationPoolKey: 'locked'
				},
				{
					...template.slots[0],
					id: 'slot-cleared',
					roleLabel: 'Cleared Runner',
					rotationPoolKey: 'cleared'
				},
				{
					...template.slots[0],
					id: 'slot-unfilled',
					roleLabel: 'Unfilled NCO',
					allowedRanks: ['CPT'],
					rotationPoolKey: 'unfilled'
				}
			]
		};

		const snapshot = await buildAdvancedRunSnapshot({
			template: packetTemplate,
			eventDates: ['2026-04-10'],
			personnel,
			holidayClosureDates: new Set(),
			historyEvents: [],
			slotOverridesByEventDate: new Map([
				[
					'2026-04-10',
					[
						{
							templateSlotId: 'slot-manual',
							slotIndex: 0,
							assigneeId: 'person-chen',
							assignmentSource: 'manual'
						},
						{
							templateSlotId: 'slot-locked',
							slotIndex: 0,
							assigneeId: 'person-baker',
							assignmentSource: 'locked'
						},
						{
							templateSlotId: 'slot-cleared',
							slotIndex: 0,
							assigneeId: null,
							assignmentSource: 'manual'
						}
					]
				]
			]),
			buildCollisionSummary: async ({ slotProposals }) => ({
				summary: { hasConflicts: true, conflicts: ['Staff Duty overlaps CQ.'] },
				slotMessages: new Map(
					slotProposals
						.filter((slot) => slot.templateSlotId === 'slot-locked')
						.map((slot) => [`${slot.templateSlotId}::${slot.slotIndex}`, ['SPC Baker has an overlapping duty.']])
				),
				blockingConflicts: ['SPC Baker has an overlapping duty.']
			})
		});

		const exportModel = snapshot.events[0].exportModel;

		expect(exportModel).toMatchObject({
			status: 'preview',
			statusLabel: 'Preview - not applied',
			templateName: 'Battalion Staff Duty',
			eventDate: '2026-04-10',
			coverage: {
				mode: 'timed',
				start: '2026-04-10T08:00:00',
				end: '2026-04-10T20:00:00',
				label: '0800-2000'
			},
			fillSummary: { totalSlots: 5, filledSlots: 3, unfilledSlots: 2 },
			collisionNotes: ['Staff Duty overlaps CQ.', 'SPC Baker has an overlapping duty.']
		});
		expect(exportModel.slotAssignments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					roleLabel: 'Generated Runner',
					assignmentSource: 'generated',
					assignee: expect.objectContaining({ id: expect.any(String) }),
					warnings: expect.any(Array),
					explanations: expect.arrayContaining([expect.stringContaining('Selected by longest break')])
				}),
				expect.objectContaining({
					roleLabel: 'Manual Runner',
					assignmentSource: 'manual',
					assignee: expect.objectContaining({ id: 'person-chen', label: 'PFC Chen' }),
					explanations: expect.arrayContaining(['Assignment was manually overridden in preview.'])
				}),
				expect.objectContaining({
					roleLabel: 'Locked Runner',
					assignmentSource: 'locked',
					assignee: expect.objectContaining({ id: 'person-baker', label: 'SPC Baker' }),
					warnings: expect.arrayContaining(['SPC Baker has an overlapping duty.']),
					explanations: expect.arrayContaining(['Assignment was locked in preview.'])
				}),
				expect.objectContaining({
					roleLabel: 'Cleared Runner',
					assignmentSource: 'manual',
					assignee: null,
					explanations: expect.arrayContaining(['Assignment was cleared in preview.'])
				}),
				expect.objectContaining({
					roleLabel: 'Unfilled NCO',
					assignmentSource: 'generated',
					assignee: null,
					explanations: expect.arrayContaining(['No personnel matched this slot eligibility rules.'])
				})
			])
		);
	});
});
