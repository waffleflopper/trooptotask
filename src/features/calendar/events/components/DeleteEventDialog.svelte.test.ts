// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import type { CalendarEventsPageAccess } from '../../contracts';
import type { Tasking } from '../../taskings/taskingModel';
import type { CalendarEvent, EventRead } from '../eventModel';
import DeleteEventDialog from './DeleteEventDialog.svelte';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

const org: CalendarEventsPageAccess = {
	orgId: 'org-a',
	orgUrlSegment: 'c-co',
	orgName: 'C Co',
	userId: '00000000-0000-4000-8000-000000000003',
	affordanceForFeatureAction: () => ({ allowed: true })
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
const tasking = (id: string, title: string, status: Tasking['status']): Tasking => ({
	id,
	title,
	event: { id: event.id, title: event.title, startsOn: event.startsOn, endsOn: event.endsOn, cancelled: false },
	responsibility: { kind: 'organization' },
	suspenseOn: '2026-10-15',
	execution: null,
	requirement: null,
	instructions: null,
	status,
	readiness: { equipment: null, checklist: null }
});
const linked = [
	tasking('00000000-0000-4000-8000-000000000401', 'Alpha trauma lane', { kind: 'open' }),
	tasking('00000000-0000-4000-8000-000000000402', 'Bravo litter teams', {
		kind: 'blocked',
		reason: 'Litters short',
		at: '2026-10-14T00:00:00Z',
		by: null
	}),
	tasking('00000000-0000-4000-8000-000000000403', 'Submit the roster', {
		kind: 'completed',
		note: null,
		at: '2026-10-16T00:00:00Z',
		by: null
	})
];

const loaded = (taskings: Tasking[]) =>
	Promise.resolve<EventRead<{ taskings: Tasking[] }>>({ status: 'loaded', value: { taskings } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sentMode = (send: { mock: { calls: unknown[][] } }, call = 0) => {
	const [url, init] = send.mock.calls[call] as [string, RequestInit];
	expect(url).toBe(`/org/org-a/api/calendar-events/${event.id}`);
	expect(init.method).toBe('DELETE');
	return JSON.parse(String(init.body)).taskings;
};

function open(taskings: Tasking[] = linked) {
	const onClose = vi.fn();
	render(DeleteEventDialog, { org, event, taskings: loaded(taskings), onClose });
	return { onClose };
}

afterEach(() => {
	cleanup();
	goto.mockReset();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('DeleteEventDialog', () => {
	it('keeps the linked Taskings as standalone unless the reader chooses to delete them', async () => {
		const send = vi.fn(async () => Response.json({ taskings: 'standalone', count: 3 }));
		vi.stubGlobal('fetch', send);
		open();

		const keep = await screen.findByRole('radio', { name: /Keep them as standalone/ });
		expect(keep.getAttribute('aria-checked')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentMode(send)).toBe('standalone');
	});

	it('sends delete, and says how many Taskings go with the Event, once the reader chooses it', async () => {
		const send = vi.fn(async () => Response.json({ taskings: 'delete', count: 3 }));
		vi.stubGlobal('fetch', send);
		open();

		await fireEvent.click(await screen.findByRole('radio', { name: /Delete them too/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event and 3 taskings' }));
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentMode(send)).toBe('delete');
	});

	it('asks nothing about Taskings when none are linked and keeps the standalone mode', async () => {
		const send = vi.fn(async () => Response.json({ taskings: 'standalone', count: 0 }));
		vi.stubGlobal('fetch', send);
		open([]);

		const confirm = await screen.findByRole('button', { name: 'Delete event' });
		await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
		expect(screen.queryByRole('radiogroup')).toBeNull();
		await fireEvent.click(confirm);
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentMode(send)).toBe('standalone');
	});

	it('keeps the dialog and the chosen mode after a failed request, so a retry is one click', async () => {
		const send = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ message: 'Server unavailable' }, { status: 500 }))
			.mockResolvedValueOnce(Response.json({ taskings: 'delete', count: 3 }));
		vi.stubGlobal('fetch', send);
		const { onClose } = open();

		await fireEvent.click(await screen.findByRole('radio', { name: /Delete them too/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event and 3 taskings' }));

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('radio', { name: /Delete them too/ }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event and 3 taskings' }));
		await waitFor(() => expect(goto).toHaveBeenCalledOnce());
		expect(sentMode(send, 1)).toBe('delete');
	});

	it('lands on the Events list and names the Event and its kept Taskings', async () => {
		const success = vi.spyOn(toastStore, 'success').mockReturnValue('toast');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ taskings: 'standalone', count: 3 }))
		);
		open();

		await screen.findByRole('radio', { name: /Keep them as standalone/ });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/org/c-co/calendar/events'));
		expect(success).toHaveBeenCalledOnce();
		expect(success.mock.calls[0][0]).toMatch(/Best Medic Competition.*\b3\b/);
	});

	it('does nothing with a reply that arrives after the Organization was left', async () => {
		const success = vi.spyOn(toastStore, 'success').mockReturnValue('toast');
		let reply!: (response: Response) => void;
		const send = vi.fn(() => new Promise<Response>((resolve) => (reply = resolve)));
		vi.stubGlobal('fetch', send);
		open();

		await screen.findByRole('radio', { name: /Keep them as standalone/ });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		endOrganizationLifetime();
		reply(Response.json({ taskings: 'standalone', count: 3 }));
		await flush();

		expect(goto).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
