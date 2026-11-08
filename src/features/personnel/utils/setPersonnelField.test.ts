import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPersonnelField } from './setPersonnelField';

const UNCONFIRMED = "We couldn't confirm the change. Reload to see what saved.";

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

	it('sends more People than one request allows in batches of 500 and combines the results', async () => {
		const ids = Array.from({ length: 501 }, (_, index) => `p${index}`);
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const { personnelIds } = JSON.parse(String(init?.body)) as { personnelIds: string[] };
			const [first, ...rest] = personnelIds;
			return Response.json({ field: 'mos', value: '68W', updatedIds: rest, refusedIds: [first], unavailableIds: [] });
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await setPersonnelField('org-1', ids, { field: 'mos', value: '68W' });

		expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).personnelIds.length)).toEqual([
			500, 1
		]);
		expect(result.refusedIds).toEqual(['p0', 'p500']);
		expect(result.updatedIds).toEqual(ids.slice(1, 500));
		expect(result.unavailableIds).toEqual([]);
	});

	it('rejects with the reason a refused write gives', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Unknown rank "ZZZ".' }, { status: 400 }))
		);

		await expect(setPersonnelField('org-1', ['a'], { field: 'rank', value: 'ZZZ' })).rejects.toThrow(
			'Unknown rank "ZZZ".'
		);
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
			await expect(setPersonnelField('org-1', ['a', 'b'], { field: 'mos', value: '68W' })).rejects.toThrow(UNCONFIRMED);
		}
	});
});
