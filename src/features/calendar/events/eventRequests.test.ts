import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteEventRequest } from './eventRequests';

afterEach(() => vi.unstubAllGlobals());

describe('deleteEventRequest', () => {
	it.each(['standalone', 'delete'] as const)('sends the %s choice to the Event deletion endpoint', async (taskings) => {
		const requests: { path: string; method: string | undefined; body: unknown }[] = [];
		vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
			requests.push({ path, method: init.method, body: JSON.parse(String(init.body)) });
			return Response.json({ taskings, count: 3 });
		});
		expect(await deleteEventRequest('org-a', 'event-a', taskings)).toEqual({ taskings, count: 3 });
		expect(requests).toEqual([
			{ path: '/org/org-a/api/calendar-events/event-a', method: 'DELETE', body: { taskings } }
		]);
	});

	it('keeps the existing request error when the Event is gone', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json({ message: 'That event is no longer available.' }, { status: 404 })
		);
		await expect(deleteEventRequest('org-a', 'event-a', 'delete')).rejects.toMatchObject({
			status: 404,
			message: 'That event is no longer available.'
		});
	});
});
