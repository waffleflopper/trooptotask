import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPersonnelField } from './setPersonnelField';

describe('setPersonnelField', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends one request and returns one outcome per Person with the stored value', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			Response.json({
				field: 'rank',
				value: 'SSG',
				results: [
					{ id: 'a', outcome: 'updated' },
					{ id: 'b', outcome: 'refused', message: 'You do not have permission to use personnel data' }
				]
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(setPersonnelField('org-1', ['a', 'b'], 'rank', 'ssg')).resolves.toEqual({
			field: 'rank',
			value: 'SSG',
			results: [
				{ id: 'a', outcome: 'updated' },
				{ id: 'b', outcome: 'refused', message: 'You do not have permission to use personnel data' }
			]
		});
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
			[
				'/org/org-1/api/personnel/field-batch',
				'POST',
				JSON.stringify({ personnelIds: ['a', 'b'], field: 'rank', value: 'ssg' })
			]
		]);
	});

	it('rejects with the reason a refused request gives', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Unknown rank "GEN".' }, { status: 400 }))
		);

		await expect(setPersonnelField('org-1', ['a'], 'rank', 'GEN')).rejects.toThrow('Unknown rank "GEN".');
	});

	it.each([
		['a lost reply', () => Promise.reject(new TypeError('fetch failed'))],
		['an unreadable reply', async () => new Response('not json')],
		[
			'a missing Person',
			async () => Response.json({ field: 'mos', value: 'x', results: [{ id: 'a', outcome: 'updated' }] })
		],
		[
			'a Person answered twice',
			async () =>
				Response.json({
					field: 'mos',
					value: 'x',
					results: [
						{ id: 'a', outcome: 'updated' },
						{ id: 'a', outcome: 'updated' }
					]
				})
		],
		[
			'a Person nobody asked about',
			async () =>
				Response.json({
					field: 'mos',
					value: 'x',
					results: [
						{ id: 'a', outcome: 'updated' },
						{ id: 'z', outcome: 'updated' }
					]
				})
		],
		[
			'an unknown outcome',
			async () =>
				Response.json({
					field: 'mos',
					value: 'x',
					results: [
						{ id: 'a', outcome: 'updated' },
						{ id: 'b', outcome: 'maybe' }
					]
				})
		]
	])('reports %s as unconfirmed', async (_name, reply) => {
		vi.stubGlobal('fetch', vi.fn(reply));

		await expect(setPersonnelField('org-1', ['a', 'b'], 'mos', 'x')).rejects.toThrow(
			"We couldn't confirm the change. Reload to see what saved."
		);
	});
});
