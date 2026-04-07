// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import AvailabilityModal from './AvailabilityModal.svelte';
import type { Personnel } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

afterEach(cleanup);

const person: Personnel = {
	id: 'person-1',
	firstName: 'Alex',
	lastName: 'Smith',
	rank: 'SGT',
	groupId: 'group-1',
	groupName: 'Alpha',
	clinicRole: '',
	mos: '11B'
};

function makeDutyEvent(assigneeId: string | null, overrides: Partial<DutyEvent> = {}): DutyEvent {
	return {
		id: 'evt-1',
		orgId: 'org-1',
		templateId: 'tpl-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-07',
		coverageMode: 'timed',
		coverageStart: '2026-04-07T08:00:00',
		coverageEnd: '2026-04-08T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: {
			templateId: 'tpl-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 24,
			slots: []
		},
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-04-01T00:00:00Z',
		updatedAt: '2026-04-01T00:00:00Z',
		runId: null,
		slotInstances: [
			{
				id: 'slot-1',
				dutyEventId: 'evt-1',
				templateSlotId: 'tslot-1',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId,
				assignmentSource: 'generated',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: null,
				unfilledReason: null,
				sortOrder: 0
			}
		],
		...overrides
	};
}

function renderModal(date: Date, dutyEvents: DutyEvent[] = [], dutyRosterHref?: string) {
	return render(AvailabilityModal, {
		props: {
			person,
			date,
			statusTypes: [],
			existingEntries: [],
			onAdd: vi.fn(),
			onRemove: vi.fn(),
			onClose: vi.fn(),
			dutyEvents,
			dutyRosterHref
		}
	});
}

describe('AvailabilityModal — advanced duty events', () => {
	it('shows a duty section when the person is assigned to a duty event on that date', () => {
		renderModal(new Date(2026, 3, 7), [makeDutyEvent('person-1')], '/org/test/calendar/duty-roster/');

		expect(screen.getByText('Battalion Staff Duty')).toBeTruthy();
	});

	it('does not show a duty section when the person is not assigned on that date', () => {
		renderModal(new Date(2026, 3, 7), [makeDutyEvent('person-OTHER')]);

		expect(screen.queryByText('Battalion Staff Duty')).toBeNull();
	});

	it('does not show a duty section when dutyEvents is empty', () => {
		renderModal(new Date(2026, 3, 7), []);

		expect(screen.queryByText(/On duty/i)).toBeNull();
	});

	it('shows duty events for overnight coverage on the second day', () => {
		// Event starts Apr 6 at 20:00, ends Apr 7 at 06:00 — person is assigned
		const overnightEvent = makeDutyEvent('person-1', {
			eventDate: '2026-04-06',
			coverageStart: '2026-04-06T20:00:00',
			coverageEnd: '2026-04-07T06:00:00'
		});
		renderModal(new Date(2026, 3, 7), [overnightEvent], '/org/test/calendar/duty-roster/');

		expect(screen.getByText('Battalion Staff Duty')).toBeTruthy();
	});

	it('renders a link to the duty roster for the assigned duty event', () => {
		renderModal(new Date(2026, 3, 7), [makeDutyEvent('person-1')], '/org/test/calendar/duty-roster/');

		const link = screen.getByRole('link', { name: /Battalion Staff Duty/i });
		expect(link.getAttribute('href')).toBe('/org/test/calendar/duty-roster/');
	});
});
