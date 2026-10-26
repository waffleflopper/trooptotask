// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEventsPageAccess } from '../../contracts';
import CancelEventDialog from '../../events/components/CancelEventDialog.svelte';
import type { CalendarEvent, EventRead } from '../../events/eventModel';
import type { TaskingSummary } from '../eventWorkModel';
import type { GroupLabels, Tasking } from '../taskingModel';
import EventDateReview from './EventDateReview.svelte';
import EventTaskings from './EventTaskings.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

const ALPHA = '00000000-0000-4000-8000-000000000201';
const org: CalendarEventsPageAccess = {
	orgId: 'org-a',
	orgUrlSegment: 'org-a',
	orgName: 'C Co',
	userId: '00000000-0000-4000-8000-000000000003',
	affordanceForFeatureAction: () => ({ allowed: false })
};
const event: CalendarEvent = {
	id: '00000000-0000-4000-8000-000000000301',
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	host: { kind: 'organization' },
	coordinatorUserId: '00000000-0000-4000-8000-000000000001',
	location: null,
	description: null,
	sourceReference: null,
	cancellation: null
};

function tasking(id: string, title: string, suspenseOn: string, extra: Partial<Tasking> = {}): Tasking {
	return {
		id,
		title,
		event: { id: event.id, title: event.title, startsOn: event.startsOn, endsOn: event.endsOn, cancelled: false },
		responsibility: { kind: 'group', groupId: ALPHA },
		suspenseOn,
		execution: null,
		requirement: null,
		instructions: null,
		status: { kind: 'open' },
		...extra
	};
}

const loaded = <T>(value: T) => Promise.resolve<EventRead<T>>({ status: 'loaded', value });
const failed = <T>() => Promise.resolve<EventRead<T>>({ status: 'failed' });
const groups: GroupLabels = { [ALPHA]: 'Alpha' };
const bravo: TaskingSummary = {
	id: '00000000-0000-4000-8000-000000000402',
	title: 'Bravo litter teams',
	responsibility: { kind: 'group', name: 'Bravo' },
	status: 'blocked',
	requiredCount: 6,
	suspenseOn: '2026-10-22',
	execution: null
};
const prepare = tasking('00000000-0000-4000-8000-000000000401', 'Submit the roster', '2026-10-15');
const closeOut = tasking('00000000-0000-4000-8000-000000000403', 'Return borrowed equipment', '2026-10-28');
const finished = tasking('00000000-0000-4000-8000-000000000404', 'Retired roster', '2026-10-15', {
	status: { kind: 'completed', note: null, at: '2026-10-16T00:00:00Z', by: null }
});

afterEach(cleanup);

describe('Event detail work groups', () => {
	function showEvent(summaries: Promise<EventRead<TaskingSummary[]>>, overrides: Partial<CalendarEvent> = {}) {
		render(EventTaskings, {
			org,
			today: '2026-10-12',
			event: { ...event, ...overrides },
			taskings: loaded({ taskings: [closeOut, prepare], groups }),
			summaries,
			choices: loaded(null),
			addOnArrival: false
		});
	}

	it('groups full and summary rows by phase and opens only the full ones', async () => {
		showEvent(loaded([bravo]));

		const preparation = within(await screen.findByRole('region', { name: 'Preparation' }));
		const execution = within(screen.getByRole('region', { name: 'Execution' }));
		const closeout = within(screen.getByRole('region', { name: 'Closeout' }));
		expect(preparation.getByRole('link', { name: /Submit the roster/ }).getAttribute('href')).toBe(
			`/org/org-a/calendar/taskings/${prepare.id}`
		);
		expect(closeout.getByRole('link', { name: /Return borrowed equipment/ })).toBeTruthy();
		expect(execution.getByText('Bravo litter teams')).toBeTruthy();
		expect(execution.queryByRole('link')).toBeNull();
		expect(execution.getByText(/Needs 6/)).toBeTruthy();
		expect(execution.getByText('Blocked')).toBeTruthy();
	});

	it('keeps the reader’s own Taskings when the other contributions fail to load', async () => {
		showEvent(failed());

		expect(await screen.findByRole('link', { name: /Submit the roster/ })).toBeTruthy();
		expect(screen.getByText('Other groups’ taskings could not be loaded')).toBeTruthy();
	});

	it('says an Event with nothing under it has nothing, and no empty group boxes render', async () => {
		render(EventTaskings, {
			org,
			today: '2026-10-12',
			event,
			taskings: loaded({ taskings: [], groups }),
			summaries: loaded([]),
			choices: loaded(null),
			addOnArrival: false
		});

		expect(await screen.findByText('No taskings under this event.')).toBeTruthy();
		expect(screen.queryByRole('region', { name: 'Preparation' })).toBeNull();
	});

	it('shows a cancelled Event’s active Taskings as still active', async () => {
		showEvent(loaded([]), { cancellation: { at: '2026-10-11T00:00:00Z', by: null, reason: null } });

		expect(await screen.findByText(/Its active taskings stay open/)).toBeTruthy();
		expect(screen.getByRole('link', { name: /Submit the roster/ })).toBeTruthy();
	});
});

describe('EventDateReview', () => {
	it('lists the active Taskings the new dates leave outside, each opening its own edit', async () => {
		render(EventDateReview, {
			org,
			taskings: loaded({ taskings: [prepare, closeOut, finished], groups }),
			before: { startsOn: '2026-10-19', endsOn: '2026-10-23' },
			after: { startsOn: '2026-10-26', endsOn: '2026-10-30' },
			onDismiss: vi.fn()
		});

		const submit = await screen.findByRole('link', { name: /Submit the roster/ });
		expect(submit.getAttribute('href')).toBe(`/org/org-a/calendar/taskings/${prepare.id}?edit`);
		expect(within(submit).getByText('Outside the new dates, in preparation')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Return borrowed equipment/ })).toBeTruthy();
		expect(screen.queryByRole('link', { name: /Retired roster/ })).toBeNull();
	});
});

describe('CancelEventDialog', () => {
	it('lists the linked active Taskings as staying active, and leaves completed ones out', async () => {
		render(CancelEventDialog, {
			org,
			event,
			taskings: loaded({ taskings: [prepare, finished], groups }),
			onCancelled: vi.fn(),
			onClose: vi.fn()
		});

		const stays = await screen.findByRole('region', { name: /stay active/ });
		expect(
			within(stays)
				.getByRole('link', { name: /Submit the roster/ })
				.getAttribute('href')
		).toBe(`/org/org-a/calendar/taskings/${prepare.id}`);
		expect(within(stays).queryByText(/Retired roster/)).toBeNull();
	});

	it('still offers the cancel when the linked Taskings could not be listed', async () => {
		render(CancelEventDialog, {
			org,
			event,
			taskings: failed<{ taskings: Tasking[]; groups: GroupLabels }>(),
			onCancelled: vi.fn(),
			onClose: vi.fn()
		});

		expect(await screen.findByText(/could not be listed/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel event' })).toBeTruthy();
	});
});
