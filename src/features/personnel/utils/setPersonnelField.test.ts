import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyWrite } from '$lib/stores/core';
import { setPersonnelField } from './setPersonnelField';

const UNCONFIRMED = "We couldn't confirm the change. Reload to see what saved.";
const rejection = (pending: Promise<unknown>) =>
	pending.then(
		() => 'resolved',
		(error: Error) => [classifyWrite(error), error.message]
	);

describe('setPersonnelField', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends one batch write and returns who updated, who was refused and who was unavailable', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			Response.json({ field: 'rank', value: 'SSG', updatedIds: ['a'], refusedIds: ['b'], unavailableIds: ['c'] })
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(setPersonnelField('org-1', ['a', 'b', 'c'], { field: 'rank', value: 'ssg' })).resolves.toEqual({
			field: 'rank',
			value: 'SSG',
			updatedIds: ['a'],
			refusedIds: ['b'],
			unavailableIds: ['c']
		});
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
			[
				'/org/org-1/api/personnel/field-batch',
				'POST',
				JSON.stringify({ personnelIds: ['a', 'b', 'c'], field: 'rank', value: 'ssg' })
			]
		]);
	});

	it('rejects a refused write as not saved, with the reason it gives', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Unknown rank "ZZZ".' }, { status: 400 }))
		);

		expect(await rejection(setPersonnelField('org-1', ['a'], { field: 'rank', value: 'ZZZ' }))).toEqual([
			'not-saved',
			'Unknown rank "ZZZ".'
		]);
	});

	it('rejects a server failure as unconfirmed', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'boom' }, { status: 503 }))
		);

		const [outcome] = await rejection(setPersonnelField('org-1', ['a'], { field: 'rank', value: 'SSG' }));

		expect(outcome).toBe('unconfirmed');
	});

	it('rejects as unconfirmed for a lost reply or one that does not account for exactly the requested People', async () => {
		const replies: Array<() => Promise<Response>> = [
			() => Promise.reject(new TypeError('fetch failed')),
			async () => new Response('not json'),
			async () =>
				Response.json({ field: 'mos', value: '68W', updatedIds: ['someone-else'], refusedIds: [], unavailableIds: [] }),
			async () => Response.json({ field: 'mos', value: '68W', updatedIds: ['a'], refusedIds: [], unavailableIds: [] }),
			async () =>
				Response.json({ field: 'mos', value: '68W', updatedIds: ['a', 'b'], refusedIds: ['b'], unavailableIds: [] }),
			async () =>
				Response.json({ field: 'ets', value: '68W', updatedIds: ['a', 'b'], refusedIds: [], unavailableIds: [] })
		];
		for (const reply of replies) {
			vi.stubGlobal('fetch', vi.fn(reply));
			expect(await rejection(setPersonnelField('org-1', ['a', 'b'], { field: 'mos', value: '68W' }))).toEqual([
				'unconfirmed',
				UNCONFIRMED
			]);
		}
	});
});
