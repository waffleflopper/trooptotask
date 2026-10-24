import { describe, expect, it, vi } from 'vitest';
import { saveRosterEntry } from './rosterEntrySave';

const target = { orgId: 'org-1', personId: 'person-9' };

function fetchReturning(response: Response | Error) {
	return vi.fn<typeof fetch>(async () => {
		if (response instanceof Error) throw response;
		return response;
	});
}

describe('saveRosterEntry', () => {
	it('posts a follow-up with a trimmed title and its due date to the Person’s follow-ups', async () => {
		const fetchFn = fetchReturning(new Response('{}', { status: 201 }));

		await saveRosterEntry(fetchFn, target, {
			kind: 'follow-up',
			title: '  Get CPR/BLS recert  ',
			notes: ' on the Nov class roster ',
			dueDate: '2026-10-09'
		});

		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('/org/org-1/api/personnel/person-9/follow-ups');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(init?.body as string)).toEqual({
			title: 'Get CPR/BLS recert',
			notes: 'on the Nov class roster',
			dueDate: '2026-10-09'
		});
	});

	it('sends a follow-up with no date as null', async () => {
		const fetchFn = fetchReturning(new Response('{}', { status: 201 }));

		await saveRosterEntry(fetchFn, target, { kind: 'follow-up', title: 'Call about leave', notes: '', dueDate: null });

		expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string).dueDate).toBeNull();
	});

	it('posts a note to the Person’s leader notes', async () => {
		const fetchFn = fetchReturning(new Response('{}', { status: 201 }));

		await saveRosterEntry(fetchFn, target, { kind: 'note', text: ' Strong week on the range. ' });

		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('/org/org-1/api/personnel/person-9/leader-notes');
		expect(JSON.parse(init?.body as string)).toEqual({ text: 'Strong week on the range.' });
	});

	it('rejects with the server’s reason for a request it refused', async () => {
		const fetchFn = fetchReturning(
			new Response(JSON.stringify({ message: 'Follow-up title is required' }), { status: 400 })
		);

		await expect(
			saveRosterEntry(fetchFn, target, { kind: 'follow-up', title: 'x', notes: '', dueDate: null })
		).rejects.toThrow('Follow-up title is required');
	});

	it('rejects with the plain fallback for a server fault or a lost connection', async () => {
		const serverFault = fetchReturning(
			new Response(JSON.stringify({ message: 'relation "x" missing' }), { status: 500 })
		);
		await expect(saveRosterEntry(serverFault, target, { kind: 'note', text: 'Hello' })).rejects.toThrow(
			'Unable to save leader note.'
		);

		const offline = fetchReturning(new TypeError('Failed to fetch'));
		await expect(
			saveRosterEntry(offline, target, { kind: 'follow-up', title: 'x', notes: '', dueDate: null })
		).rejects.toThrow('Unable to add follow-up.');
	});
});
