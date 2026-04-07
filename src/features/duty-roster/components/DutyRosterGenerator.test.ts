// @vitest-environment happy-dom
import type { AssignmentType, Personnel } from '$lib/types';
import type { DutyEvent } from '../duty-roster.types';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/svelte';
import DutyRosterGenerator from './DutyRosterGenerator.svelte';

function makeAssignmentType(overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id: 'at-1',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#334155',
		exemptPersonnelIds: [],
		showInDateHeader: false,
		...overrides
	};
}

function makePersonnel(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'person-1',
		firstName: 'Casey',
		lastName: 'Nolan',
		rank: 'SGT',
		groupId: 'group-hq',
		groupName: 'Headquarters',
		mos: '11B',
		clinicRole: 'Squad Leader',
		archivedAt: null,
		...overrides
	};
}

function makeDutyEvent(overrides: Partial<DutyEvent> = {}): DutyEvent {
	return {
		id: 'event-1',
		orgId: 'test-org',
		runId: 'run-1',
		templateId: 'tmpl-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00',
		coverageEnd: '2026-04-11T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		rulesSnapshot: {
			templateId: 'tmpl-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			isBlocking: true,
			cooldownHours: 24,
			softPreferences: [],
			slots: [
				{
					templateSlotId: 'slot-1',
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					preferredGroupIds: [],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'staff-duty-primary',
					blockingMode: 'blocking',
					sortOrder: 0
				}
			]
		},
		slotInstances: [
			{
				id: 'slot-instance-1',
				dutyEventId: 'event-1',
				templateSlotId: 'slot-1',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId: 'person-1',
				assignmentSource: 'generated',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: null,
				unfilledReason: null,
				sortOrder: 0
			}
		],
		createdAt: '2026-04-04T00:00:00.000Z',
		updatedAt: '2026-04-04T00:00:00.000Z',
		...overrides
	};
}

function renderGenerator(overrides: Parameters<typeof render>[1]['props'] = {}) {
	const person = makePersonnel();
	return render(DutyRosterGenerator, {
		props: {
			initialAssignmentTypeId: 'at-1',
			assignmentTypes: [makeAssignmentType()],
			assignments: [],
			advancedDutyEvents: [],
			personnelByGroup: [{ group: 'Headquarters', personnel: [person] }],
			groups: ['Headquarters'],
			availabilityEntries: [],
			statusTypes: [],
			specialDays: [],
			rosterHistory: [],
			onApplyRoster: async () => true,
			onSaveRoster: async () => null,
			onDeleteRoster: async () => {},
			onUpdateExemptions: async () => {},
			...overrides
		}
	});
}

async function generateSimpleRoster(date = '2026-04-10') {
	await fireEvent.input(screen.getByLabelText('Start Date'), { target: { value: date } });
	await fireEvent.input(screen.getByLabelText('End Date'), { target: { value: date } });
	await fireEvent.click(screen.getByRole('button', { name: /Continue to Personnel/ }));
	await fireEvent.click(screen.getByRole('button', { name: 'Generate Roster' }));
	await waitFor(() => expect(screen.getByRole('button', { name: 'Apply to Calendar' })).toBeTruthy());
}

describe('DutyRosterGenerator', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders as a page section instead of a dialog shell', () => {
		renderGenerator();

		expect(screen.getByText('Duty planning')).toBeTruthy();
		expect(screen.getByText('Setup')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Continue to Personnel/ })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps a soldier available when they are assigned to a non-blocking advanced duty slot', async () => {
		renderGenerator({
			advancedDutyEvents: [
				makeDutyEvent({
					rulesSnapshot: {
						...makeDutyEvent().rulesSnapshot,
						slots: [{ ...makeDutyEvent().rulesSnapshot.slots[0], blockingMode: 'non-blocking' }]
					}
				})
			]
		});

		await generateSimpleRoster();

		expect(screen.getByText(/Nolan, Casey/)).toBeTruthy();
		expect(screen.queryByText('No eligible personnel available')).toBeNull();
	});

	it('shows a conflict in preview when a soldier is assigned to a blocking advanced duty slot', async () => {
		renderGenerator({
			advancedDutyEvents: [makeDutyEvent()]
		});

		await generateSimpleRoster();

		expect(screen.getByText('No eligible personnel available')).toBeTruthy();
	});
});
