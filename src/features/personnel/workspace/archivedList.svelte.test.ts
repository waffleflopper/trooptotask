import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import type { PersonnelArchivedArtifact } from '../contracts';
import { jsonResponse, makeFollowUp, makeLeaderNote, recordingFetch } from '../logFixtures.testHelper';
import { ArchivedList } from './archivedList.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

const followUp: PersonnelArchivedArtifact = {
	kind: 'follow-up',
	...makeFollowUp({ id: 'f1', status: 'archived', archivedAt: '2026-10-14T12:00:00.000Z' })
};
const note: PersonnelArchivedArtifact = {
	kind: 'note',
	...makeLeaderNote({ id: 'n1', archivedAt: '2026-10-15T12:00:00.000Z' })
};
const document: PersonnelArchivedArtifact = {
	kind: 'document',
	id: 'd1',
	personnelId: 'person-1',
	title: 'Profile',
	fileName: 'profile.pdf',
	fileSizeBytes: 2048,
	contentType: 'application/pdf',
	uploadedBy: '1SG Ramos',
	createdAt: '2026-10-01T12:00:00.000Z',
	archivedAt: '2026-10-16T12:00:00.000Z'
};

function listWith(respond: Parameters<typeof recordingFetch>[0]) {
	const api = recordingFetch(respond);
	const list = new ArchivedList([followUp, note, document], {
		orgId: 'org-1',
		personnelId: 'person-1',
		fetch: api.fetch
	});
	return { list, requests: api.requests };
}

describe('ArchivedList', () => {
	beforeEach(() => {
		vi.mocked(invalidate).mockClear();
	});

	it('counts each kind and narrows the visible rows to the chosen one', () => {
		const { list } = listWith(() => jsonResponse({}));

		expect([list.countOf('all'), list.countOf('follow-up'), list.countOf('counseling'), list.countOf('note')]).toEqual([
			3, 1, 0, 1
		]);

		list.filter = 'note';

		expect(list.visible.map((record) => record.id)).toEqual(['n1']);
	});

	it('restores a record through its own endpoint and drops it from the list', async () => {
		const { list, requests } = listWith(() => jsonResponse({}));

		await list.restore(note);

		expect(requests).toEqual([
			{ url: '/org/org-1/api/personnel/person-1/leader-notes/n1', method: 'PATCH', body: { action: 'restore' } }
		]);
		expect(list.records.map((record) => record.id)).toEqual(['f1', 'd1']);
		expect(invalidate).toHaveBeenCalledWith('app:personnel-detail-counts');
	});

	it('keeps a row busy until its own request settles, even when another row finishes first', async () => {
		const release: Record<string, () => void> = {};
		const { list } = listWith(
			(request) =>
				new Promise((resolve) => {
					release[request.url.split('/').pop()!] = () => resolve(jsonResponse({}));
				})
		);

		const first = list.restore(followUp);
		const second = list.restore(note);
		release.f1();
		await first;

		expect(list.isBusy(followUp)).toBe(false);
		expect(list.isBusy(note)).toBe(true);
		release.n1();
		await second;
		expect(list.isBusy(note)).toBe(false);
	});

	it('keeps a record that failed to restore and says why', async () => {
		const { list } = listWith(() => jsonResponse({ message: 'No.' }, 500));

		await list.restore(followUp);

		expect(list.records).toHaveLength(3);
		expect(list.error).not.toBe('');
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('deletes a record and tells the user when its file is removed later', async () => {
		const { list, requests } = listWith(() => jsonResponse({ fileCleanup: 'pending' }));

		const error = await list.remove(document);

		expect(error).toBeNull();
		expect(requests[0]).toMatchObject({ url: '/org/org-1/api/personnel/person-1/documents/d1', method: 'DELETE' });
		expect(list.records.map((record) => record.id)).toEqual(['f1', 'n1']);
		expect(list.notice).toBe('Deleted Profile. Its stored file will be removed automatically.');
	});

	it('keeps a record that failed to delete and returns the error', async () => {
		const { list } = listWith(() => jsonResponse({ message: 'No.' }, 500));

		const error = await list.remove(followUp);

		expect(error).not.toBeNull();
		expect(list.records).toHaveLength(3);
		expect(list.notice).toBe('');
	});
});
