import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime } from './lifetime.svelte';
import { getCatalogUsage, putCatalogArchive } from './catalogArchive';

afterEach(() => vi.unstubAllGlobals());

describe('putCatalogArchive', () => {
	it('puts the id and direction to the resource and resolves to the server archive time', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ archivedAt: '2030-03-04T05:06:07Z' }));
		vi.stubGlobal('fetch', fetchMock);

		const archivedAt = await putCatalogArchive('org-7', 'status-types', 'leave', true);

		expect(archivedAt).toBe('2030-03-04T05:06:07Z');
		expect(fetchMock).toHaveBeenCalledWith('/org/org-7/api/status-types/archive', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'leave', archived: true })
		});
	});

	it('resolves to null when the type is restored', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ archivedAt: null })));

		expect(await putCatalogArchive('org-7', 'training-types', 'cpr', false)).toBeNull();
	});

	it('rejects with the server message when the route refuses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ message: 'Training type not found' }, { status: 404 }))
		);

		await expect(putCatalogArchive('org-7', 'training-types', 'cpr', true)).rejects.toThrow('Training type not found');
	});

	it('rejects a reply that does not carry an archive time', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));

		await expect(putCatalogArchive('org-7', 'training-types', 'cpr', true)).rejects.toThrow();
	});

	it('never settles once the user has left the Organization', async () => {
		let answer!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => (answer = resolve))));
		const settled = vi.fn();
		void putCatalogArchive('org-7', 'training-types', 'cpr', true).then(settled, settled);

		endOrganizationLifetime();
		answer(Response.json({ archivedAt: '2030-03-04T05:06:07Z' }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(settled).not.toHaveBeenCalled();
	});
});

describe('getCatalogUsage', () => {
	it('reads the counts keyed by type id', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ a: 2, b: 0 }));
		vi.stubGlobal('fetch', fetchMock);

		expect(await getCatalogUsage('org-7', 'status-types')).toEqual({ a: 2, b: 0 });
		expect(fetchMock).toHaveBeenCalledWith('/org/org-7/api/status-types/usage');
	});

	it('rejects when the caller may not configure the catalog', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 })));

		await expect(getCatalogUsage('org-7', 'training-types')).rejects.toThrow('Forbidden');
	});

	it('rejects counts that are not numbers', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ a: 'many' })));

		await expect(getCatalogUsage('org-7', 'training-types')).rejects.toThrow();
	});
});
