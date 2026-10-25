import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { whatsNewMock } = vi.hoisted(() => ({
	whatsNewMock: { list: vi.fn(), save: vi.fn(), deleteEntry: vi.fn() }
}));

vi.mock('$features/platform-admin/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/platform-admin/index.server')>()),
	createPlatformWhatsNewOperations: vi.fn(async () => whatsNewMock)
}));

import { actions, load } from './+page.server';

function event(form: Record<string, string | string[]>) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(form))
		for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
	return { request: new Request('http://localhost/admin/announcements/whats-new', { method: 'POST', body }) } as never;
}

describe('admin What’s New route', () => {
	beforeEach(() => vi.resetAllMocks());

	it('streams the entries and reports a failed read as its own region', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		whatsNewMock.list.mockResolvedValueOnce([{ id: 'a' }]);
		const loaded = (await load({} as never)) as unknown as PageData;
		await expect(loaded.entries).resolves.toEqual({ status: 'loaded', entries: [{ id: 'a' }] });
		whatsNewMock.list.mockRejectedValueOnce(new Error('private provider failure'));
		const failed = (await load({} as never)) as unknown as PageData;
		await expect(failed.entries).resolves.toEqual({ status: 'failed' });
		consoleError.mockRestore();
	});

	it('saves the ordered paragraphs and passes the publish date through', async () => {
		whatsNewMock.save.mockResolvedValueOnce({ status: 'saved', id: 'entry-1', published: true });
		const result = await actions.save(
			event({ id: 'entry-1', title: 'Roster', paragraph: ['One', 'Two'], publishOn: '2026-10-24' })
		);
		expect(whatsNewMock.save).toHaveBeenCalledWith({
			id: 'entry-1',
			title: 'Roster',
			paragraphs: ['One', 'Two'],
			publishOn: '2026-10-24'
		});
		expect(result).toEqual({ success: true, id: 'entry-1', published: true });
	});

	it('creates when no id is sent and sends no publish date for a plain save', async () => {
		whatsNewMock.save.mockResolvedValueOnce({ status: 'saved', id: 'new-1', published: false });
		await actions.save(event({ id: '', title: 'Roster', paragraph: ['One'] }));
		expect(whatsNewMock.save).toHaveBeenCalledWith({
			id: null,
			title: 'Roster',
			paragraphs: ['One'],
			publishOn: undefined
		});
	});

	it.each([
		['an invalid result', { status: 'invalid', error: 'Title is required' }, 400, 'Title is required'],
		['a missing entry', { status: 'not_found' }, 404, 'Entry not found']
	])('maps %s to a failure', async (_name, saved, status, error) => {
		whatsNewMock.save.mockResolvedValueOnce(saved);
		expect(await actions.save(event({ id: 'entry-1', title: 'x', paragraph: ['x'] }))).toEqual({
			status,
			data: { error }
		});
	});

	it('rejects a malformed entry id before saving', async () => {
		expect(await actions.save(event({ id: '../x', title: 'x', paragraph: ['x'] }))).toEqual({
			status: 400,
			data: { error: 'Invalid entry ID' }
		});
		expect(whatsNewMock.save).not.toHaveBeenCalled();
	});

	it('maps a store failure to a generic 500 without the provider detail', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		whatsNewMock.save.mockRejectedValueOnce(new Error('private provider failure'));
		expect(await actions.save(event({ id: '', title: 'x', paragraph: ['x'] }))).toEqual({
			status: 500,
			data: { error: 'Failed to save entry' }
		});
		consoleError.mockRestore();
	});

	it.each([
		[{ status: 'deleted' }, { success: true, deleted: true }],
		[{ status: 'not_found' }, { status: 404, data: { error: 'Entry not found' } }]
	])('maps the delete result %j', async (deleted, expected) => {
		whatsNewMock.deleteEntry.mockResolvedValueOnce(deleted);
		expect(await actions.delete(event({ id: 'entry-1' }))).toEqual(expected);
	});

	it('rejects a malformed id on delete', async () => {
		expect(await actions.delete(event({ id: '' }))).toEqual({ status: 400, data: { error: 'Invalid entry ID' } });
		expect(whatsNewMock.deleteEntry).not.toHaveBeenCalled();
	});
});
