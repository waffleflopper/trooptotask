import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import { jsonResponse, makeFollowUp, recordingFetch } from '../logFixtures.testHelper';
import { FollowUpList } from './followUpList.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

const NOW = '2026-10-19T14:00:00.000Z';

function listWith(rows = [makeFollowUp()], respond: Parameters<typeof recordingFetch>[0]) {
	const api = recordingFetch(respond);
	const list = new FollowUpList(rows, { orgId: 'org-1', personnelId: 'person-1', fetch: api.fetch, now: () => NOW });
	return { list, requests: api.requests };
}

describe('FollowUpList', () => {
	beforeEach(() => {
		vi.mocked(invalidate).mockClear();
	});

	it('shows a follow-up as completed before the server answers, then keeps the saved row', async () => {
		let release: (response: Response) => void = () => {};
		const { list, requests } = listWith(
			[makeFollowUp()],
			() => new Promise<Response>((resolve) => (release = resolve))
		);

		const pending = list.toggle('follow-up-1');

		expect(list.rows[0]).toMatchObject({ status: 'completed', completedAt: NOW });
		release(jsonResponse({ status: 'completed', completedAt: '2026-10-19T14:00:01.000Z', completedBy: 'SFC Diaz' }));
		await pending;

		expect(list.rows[0]).toMatchObject({ status: 'completed', completedBy: 'SFC Diaz' });
		expect(requests).toEqual([
			{
				url: '/org/org-1/api/personnel/person-1/follow-ups/follow-up-1',
				method: 'PATCH',
				body: { status: 'completed' }
			}
		]);
		expect(invalidate).toHaveBeenCalledWith('app:personnel-detail-counts');
	});

	it('puts a failed completion back with an inline error and leaves the counts alone', async () => {
		const { list } = listWith([makeFollowUp()], () => jsonResponse({ message: 'Database is down.' }, 500));

		await list.toggle('follow-up-1');

		expect(list.rows[0]).toMatchObject({ status: 'open', completedAt: null });
		expect(list.rowErrors['follow-up-1']).not.toBe('');
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('reopens a completed follow-up', async () => {
		const done = makeFollowUp({
			status: 'completed',
			completedAt: '2026-10-10T09:00:00.000Z',
			completedBy: 'SFC Diaz'
		});
		const { list, requests } = listWith([done], () =>
			jsonResponse({ status: 'open', completedAt: null, completedBy: null })
		);

		await list.toggle('follow-up-1');

		expect(list.rows[0]).toMatchObject({ status: 'open', completedAt: null, completedBy: null });
		expect(requests[0].body).toEqual({ status: 'open' });
	});

	it('saves an edit with a cleared due date as null and trimmed text', async () => {
		const { list, requests } = listWith([makeFollowUp({ dueDate: '2026-10-30' })], () =>
			jsonResponse({ title: 'Dental exam', notes: '', dueDate: null })
		);

		const saved = await list.save('follow-up-1', { title: '  Dental exam ', notes: ' ', dueDate: '' });

		expect(saved).toBe(true);
		expect(requests[0].body).toEqual({ title: 'Dental exam', notes: '', dueDate: null });
		expect(list.rows[0]).toMatchObject({ title: 'Dental exam', dueDate: null });
	});

	it('refuses a blank title without sending anything', async () => {
		const { list, requests } = listWith([makeFollowUp()], () => jsonResponse({}));

		const saved = await list.save('follow-up-1', { title: '  ', notes: '', dueDate: '' });

		expect(saved).toBe(false);
		expect(requests).toEqual([]);
		expect(list.rowErrors['follow-up-1']).toBe('Enter a follow-up title.');
	});

	it('removes an archived follow-up from the list and refreshes the counts', async () => {
		const { list, requests } = listWith(
			[makeFollowUp(), makeFollowUp({ id: 'follow-up-2', title: 'Range card' })],
			() => jsonResponse({ id: 'follow-up-1', status: 'archived' })
		);

		const archived = await list.archive('follow-up-1');

		expect(archived).toBe(true);
		expect(list.rows.map((row) => row.id)).toEqual(['follow-up-2']);
		expect(requests[0].body).toEqual({ status: 'archived' });
		expect(invalidate).toHaveBeenCalledWith('app:personnel-detail-counts');
	});

	it('keeps the follow-up when archiving fails', async () => {
		const { list } = listWith([makeFollowUp()], () => jsonResponse({ message: 'No.' }, 500));

		const archived = await list.archive('follow-up-1');

		expect(archived).toBe(false);
		expect(list.rows.map((row) => row.id)).toEqual(['follow-up-1']);
		expect(list.rowErrors['follow-up-1']).not.toBe('');
	});
});
