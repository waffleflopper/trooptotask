import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import { jsonResponse, makeLeaderNote, recordingFetch } from '../logFixtures.testHelper';
import { LeaderNoteList } from './leaderNoteList.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

function noteOn(day: number, overrides: Parameters<typeof makeLeaderNote>[0] = {}) {
	const stamp = `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
	return makeLeaderNote({ id: `note-${day}`, text: `Note from the ${day}th`, createdAt: stamp, ...overrides });
}

function listWith(notes: ReturnType<typeof noteOn>[], total: number, respond: Parameters<typeof recordingFetch>[0]) {
	const api = recordingFetch(respond);
	const list = new LeaderNoteList({ notes, total }, { orgId: 'org-1', personnelId: 'person-1', fetch: api.fetch });
	return { list, requests: api.requests };
}

describe('LeaderNoteList', () => {
	beforeEach(() => {
		vi.mocked(invalidate).mockClear();
	});

	it('counts every active note and offers the ones not loaded yet', () => {
		const { list } = listWith([noteOn(15), noteOn(14)], 9, () => jsonResponse([]));

		expect(list.count).toBe(9);
		expect(list.olderRemaining).toBe(7);
		expect(list.rows.map((note) => note.id)).toEqual(['note-15', 'note-14']);
	});

	it('asks for the page before the oldest loaded note and appends it', async () => {
		const { list, requests } = listWith([noteOn(15), noteOn(14)], 4, () => jsonResponse([noteOn(13), noteOn(12)]));

		await list.loadOlder();

		const requested = new URL(requests[0].url, 'http://localhost');
		expect(requested.pathname).toBe('/org/org-1/api/personnel/person-1/leader-notes');
		expect(requested.searchParams.get('beforeCreatedAt')).toBe('2026-10-14T12:00:00.000Z');
		expect(requested.searchParams.get('beforeId')).toBe('note-14');
		const limit = Number(requested.searchParams.get('limit'));
		expect(limit).toBeGreaterThan(0);
		expect(limit).toBeLessThanOrEqual(50);
		expect(list.rows.map((note) => note.id)).toEqual(['note-15', 'note-14', 'note-13', 'note-12']);
		expect(list.olderRemaining).toBe(0);
	});

	it('stops offering older notes once a page comes back empty', async () => {
		const { list } = listWith([noteOn(15)], 3, () => jsonResponse([]));

		await list.loadOlder();

		expect(list.olderRemaining).toBe(0);
	});

	it('reports a failed page and lets the user try again', async () => {
		let failing = true;
		const { list } = listWith([noteOn(15)], 2, () =>
			failing ? jsonResponse({ message: 'Down.' }, 500) : jsonResponse([noteOn(14)])
		);

		await list.loadOlder();
		expect(list.olderError).not.toBe('');
		expect(list.olderRemaining).toBe(1);

		failing = false;
		await list.loadOlder();

		expect(list.olderError).toBe('');
		expect(list.rows.map((note) => note.id)).toEqual(['note-15', 'note-14']);
	});

	it('shows a note saved from the composer first and counts it', async () => {
		const { list, requests } = listWith([noteOn(15)], 1, () => jsonResponse(noteOn(18, { id: 'note-new' })));
		list.draft.fields.text = 'Volunteered for the detail';

		await list.draft.submit();

		expect(requests[0].body).toEqual({ text: 'Volunteered for the detail' });
		expect(list.rows.map((note) => note.id)).toEqual(['note-new', 'note-15']);
		expect(list.count).toBe(2);
	});

	it('saves edited text in place', async () => {
		const { list, requests } = listWith([noteOn(15)], 1, () => jsonResponse({ text: 'Corrected text' }));

		const saved = await list.save('note-15', ' Corrected text ');

		expect(saved).toBe(true);
		expect(requests[0]).toMatchObject({ method: 'PATCH', body: { text: 'Corrected text' } });
		expect(list.rows[0]).toMatchObject({ id: 'note-15', author: '1SG Ramos', text: 'Corrected text' });
	});

	it('drops an archived note from the list and the count', async () => {
		const { list } = listWith([noteOn(15), noteOn(14)], 5, () => jsonResponse({ id: 'note-15' }));

		const archived = await list.archive('note-15');

		expect(archived).toBe(true);
		expect(list.rows.map((note) => note.id)).toEqual(['note-14']);
		expect(list.count).toBe(4);
		expect(invalidate).toHaveBeenCalledWith('app:personnel-detail-counts');
	});
});
