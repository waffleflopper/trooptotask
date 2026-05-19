// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import DailyAssignmentModal from './DailyAssignmentModal.svelte';
import type { AssignmentType, Personnel } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

afterEach(cleanup);

function makeDutyEvent(overrides: Partial<DutyEvent> = {}): DutyEvent {
	return {
		id: 'evt-1',
		orgId: 'org-1',
		templateId: 'tpl-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-06',
		coverageMode: 'timed',
		coverageStart: '2026-04-06T20:00:00',
		coverageEnd: '2026-04-07T06:00:00',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: {
			templateId: 'tpl-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '20:00',
			endTime: '06:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 24,
			slots: []
		},
		fillSummary: { totalSlots: 2, filledSlots: 1, unfilledSlots: 1 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-04-01T00:00:00Z',
		updatedAt: '2026-04-01T00:00:00Z',
		runId: null,
		slotInstances: [],
		...overrides
	};
}

function renderModal(date: Date, dutyEvents: DutyEvent[] = [], dutyRosterHref?: string) {
	return render(DailyAssignmentModal, {
		props: {
			date,
			assignmentTypes: [],
			assignments: [],
			personnelByGroup: [],
			groups: [],
			onSetAssignment: vi.fn(),
			onRemoveAssignment: vi.fn(),
			onClose: vi.fn(),
			dutyEvents,
			dutyRosterHref
		}
	});
}

describe('DailyAssignmentModal — advanced duty events', () => {
	it('renders a duty event that starts on the selected date', () => {
		renderModal(new Date(2026, 3, 6), [makeDutyEvent()], '/org/test/duty-rosters/');

		expect(screen.getByText('Battalion Staff Duty')).toBeTruthy();
		// Should show fill summary
		expect(screen.getByText(/1 of 2/)).toBeTruthy();
	});

	it('renders an overnight duty event on the second day it covers', () => {
		// Event starts Apr 6, coverage extends into Apr 7 — should appear on Apr 7
		renderModal(new Date(2026, 3, 7), [makeDutyEvent()], '/org/test/duty-rosters/');

		expect(screen.getByText('Battalion Staff Duty')).toBeTruthy();
	});

	it('does not render a duty section when no events cover the selected date', () => {
		// Event is Apr 6–7, modal is for Apr 8
		renderModal(new Date(2026, 3, 8), [makeDutyEvent()]);

		expect(screen.queryByText('Battalion Staff Duty')).toBeNull();
	});

	it('does not render a duty section when dutyEvents is empty', () => {
		renderModal(new Date(2026, 3, 6), []);

		expect(screen.queryByText(/Advanced duty/i)).toBeNull();
	});

	it('renders a link to the duty roster when dutyRosterHref is provided', () => {
		renderModal(new Date(2026, 3, 6), [makeDutyEvent()], '/org/test/duty-rosters/');

		const link = screen.getByRole('link', { name: /Battalion Staff Duty/i });
		expect(link.getAttribute('href')).toBe('/org/test/duty-rosters/');
	});

	it('does not render a midnight-end event on the end date', () => {
		// Event ends exactly at midnight on Apr 7 — should NOT appear on Apr 7
		const event = makeDutyEvent({
			coverageStart: '2026-04-06T20:00:00',
			coverageEnd: '2026-04-07T00:00:00'
		});
		renderModal(new Date(2026, 3, 7), [event]);

		expect(screen.queryByText('Battalion Staff Duty')).toBeNull();
	});
});

describe('DailyAssignmentModal — searchable assignments', () => {
	const assignmentTypes: AssignmentType[] = [
		{
			id: 'type-1',
			name: 'Charge of Quarters',
			shortName: 'CQ',
			assignTo: 'personnel',
			color: '#2563eb',
			exemptPersonnelIds: [],
			showInDateHeader: false
		}
	];
	const personnel: Personnel[] = [
		{
			id: 'person-1',
			firstName: 'Alex',
			lastName: 'Smith',
			rank: 'SGT',
			groupId: 'group-1',
			groupName: 'Alpha',
			clinicRole: '',
			mos: '11B'
		},
		{
			id: 'person-2',
			firstName: 'Jamie',
			lastName: 'Taylor',
			rank: 'CPT',
			groupId: 'group-1',
			groupName: 'Alpha',
			clinicRole: '',
			mos: '68W'
		}
	];

	it('filters personnel assignment options by typed text', async () => {
		const onSetAssignment = vi.fn();
		render(DailyAssignmentModal, {
			props: {
				date: new Date(2026, 3, 6),
				assignmentTypes,
				assignments: [],
				personnelByGroup: [{ group: 'Alpha', personnel }],
				groups: [],
				onSetAssignment,
				onRemoveAssignment: vi.fn(),
				onClose: vi.fn()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' }));
		await fireEvent.input(screen.getByPlaceholderText('Search assignments...'), {
			target: { value: 'tay' }
		});

		expect(screen.queryByRole('option', { name: 'SGT Smith, Alex - Alpha' })).toBeNull();
		await fireEvent.click(screen.getByRole('option', { name: 'CPT Taylor, Jamie - Alpha' }));

		expect(onSetAssignment).toHaveBeenCalledWith('2026-04-06', 'type-1', 'person-2');
	});

	it('does not offer archived assignment types as editable daily choices', () => {
		render(DailyAssignmentModal, {
			props: {
				date: new Date(2026, 3, 6),
				assignmentTypes: [
					...assignmentTypes,
					{
						id: 'type-archived',
						name: 'Archived Duty',
						shortName: 'OLD',
						assignTo: 'personnel',
						color: '#6b7280',
						exemptPersonnelIds: [],
						showInDateHeader: false,
						archivedAt: '2026-05-04T12:00:00.000Z'
					}
				],
				assignments: [],
				personnelByGroup: [{ group: 'Alpha', personnel }],
				groups: [],
				onSetAssignment: vi.fn(),
				onRemoveAssignment: vi.fn(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Set Archived Duty assignee' })).toBeNull();
	});
});
