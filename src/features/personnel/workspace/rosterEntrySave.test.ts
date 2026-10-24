import { describe, expect, it, vi } from 'vitest';
import { saveRosterEntry, saveRosterEntryBatch } from './rosterEntrySave';

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

describe('saveRosterEntryBatch', () => {
	const ids = ['person-1', 'person-2', 'person-3'];

	it('posts one follow-up for every Person and returns who got it and who was skipped', async () => {
		const fetchFn = fetchReturning(
			Response.json({ writtenIds: ['person-1', 'person-3'], unavailableIds: ['person-2'] }, { status: 201 })
		);

		const result = await saveRosterEntryBatch(fetchFn, 'org-1', ids, {
			kind: 'follow-up',
			title: 'Turn in CIF hand receipt',
			notes: '',
			dueDate: '2026-10-30'
		});

		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('/org/org-1/api/personnel/follow-ups/batch');
		expect(JSON.parse(init?.body as string)).toEqual({
			personnelIds: ids,
			title: 'Turn in CIF hand receipt',
			notes: '',
			dueDate: '2026-10-30'
		});
		expect(result).toEqual({ writtenIds: ['person-1', 'person-3'], unavailableIds: ['person-2'] });
	});

	it('posts one note for every Person to the leader-notes batch', async () => {
		const fetchFn = fetchReturning(Response.json({ writtenIds: ids, unavailableIds: [] }, { status: 201 }));

		await saveRosterEntryBatch(fetchFn, 'org-1', ids, { kind: 'note', text: 'Range Thursday' });

		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('/org/org-1/api/personnel/leader-notes/batch');
		expect(JSON.parse(init?.body as string)).toEqual({ personnelIds: ids, text: 'Range Thursday' });
	});

	it('rejects with the server’s reason, or the plain fallback for a fault', async () => {
		const refused = fetchReturning(
			new Response(JSON.stringify({ message: 'Leader note is required' }), { status: 400 })
		);
		await expect(saveRosterEntryBatch(refused, 'org-1', ids, { kind: 'note', text: ' ' })).rejects.toThrow(
			'Leader note is required'
		);

		const offline = fetchReturning(new TypeError('Failed to fetch'));
		await expect(
			saveRosterEntryBatch(offline, 'org-1', ids, { kind: 'follow-up', title: 'x', notes: '', dueDate: null })
		).rejects.toThrow('Unable to add follow-up.');
	});

	it('says the entries may have been saved when the answer names People it was not asked about', async () => {
		const fetchFn = fetchReturning(Response.json({ writtenIds: ['someone-else'], unavailableIds: [] }));

		await expect(saveRosterEntryBatch(fetchFn, 'org-1', ids, { kind: 'note', text: 'Hi' })).rejects.toThrow(
			'The entries may have been saved. Check a Log before trying again.'
		);
	});
});
