// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CalendarEventsPageAccess } from '../../contracts';
import type { TaskingWorkspace } from '../../taskings/taskingReadModel';
import type { CalendarEvent, EventDetail, EventRead } from '../eventModel';
import EventDetailPage from './EventDetailPage.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(), replaceState: vi.fn() }));

const cancelled: CalendarEvent = {
	id: '00000000-0000-4000-8000-000000000301',
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	host: { kind: 'organization' },
	coordinatorUserId: '00000000-0000-4000-8000-000000000001',
	location: null,
	description: null,
	sourceReference: null,
	cancellation: { at: '2026-10-12T12:00:00Z', by: '00000000-0000-4000-8000-000000000001', reason: null }
};
const loaded = <T>(value: T) => Promise.resolve<EventRead<T>>({ status: 'loaded', value });
const never = <T>() => new Promise<T>(() => {});

function show(manageEvents: boolean) {
	const org: CalendarEventsPageAccess = {
		orgId: 'org-a',
		orgUrlSegment: 'c-co',
		orgName: 'C Co',
		userId: '00000000-0000-4000-8000-000000000003',
		affordanceForFeatureAction: (action) => ({
			allowed: manageEvents && action === POLICY_ACTION_CATALOG.calendar.manageEvents
		})
	};
	render(EventDetailPage, {
		org,
		today: '2026-10-12',
		detail: loaded<EventDetail>({ event: cancelled, members: {}, memberOptions: [], currentUserId: org.userId }),
		activity: loaded([]),
		taskings: loaded({ taskings: [], groups: {}, staffing: {} }),
		taskingSummaries: loaded([]),
		workspace: never<EventRead<TaskingWorkspace>>(),
		taskingChoices: loaded(null),
		addTasking: false
	});
}

afterEach(cleanup);

describe('EventDetailPage', () => {
	it('lets an Event manager delete a cancelled Event from the more-actions menu', async () => {
		show(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'More event actions' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete event' }));

		expect(await screen.findByRole('alertdialog')).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Cancel event' })).toBeNull();
	});

	it('offers no delete to a reader who cannot manage Events', async () => {
		show(false);

		expect(await screen.findByRole('link', { name: /Show on availability/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'More event actions' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Delete event' })).toBeNull();
	});
});
