import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { announcementsMock, createAnnouncementsMock } = vi.hoisted(() => {
	const announcements = {
		list: vi.fn(),
		dismissalCounts: vi.fn(),
		create: vi.fn(),
		setActive: vi.fn(),
		delete: vi.fn()
	};

	return {
		announcementsMock: announcements,
		createAnnouncementsMock: vi.fn(() => announcements)
	};
});

vi.mock('$features/platform-admin/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/platform-admin/index.server')>()),
	createPlatformAnnouncementOperations: createAnnouncementsMock
}));

import { actions, load } from './+page.server';

const ANNOUNCEMENT_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/announcements', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

describe('admin announcements route shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('load streams the banners and the per-banner dismissal counts', async () => {
		const banner = {
			id: ANNOUNCEMENT_ID,
			title: 'Readiness update',
			message: 'Brief at 0900',
			type: 'info',
			isActive: true,
			createdAt: '2026-06-03T10:00:00.000Z',
			expiresAt: null
		};
		announcementsMock.list.mockResolvedValueOnce([banner]);
		announcementsMock.dismissalCounts.mockResolvedValueOnce({ [ANNOUNCEMENT_ID]: 3 });

		const result = (await load({} as unknown as Parameters<typeof load>[0])) as unknown as PageData;

		await expect(result.banners).resolves.toEqual({ status: 'loaded', announcements: [banner] });
		await expect(result.dismissals).resolves.toEqual({ status: 'loaded', counts: { [ANNOUNCEMENT_ID]: 3 } });
	});

	it('preserves validation failures before calling the announcement use case', async () => {
		const result = await actions.create({
			request: makeRequest({ title: '', message: 'Missing title', type: 'info' })
		} as unknown as Parameters<(typeof actions)['create']>[0]);

		expect(result).toEqual({ status: 400, data: { error: 'Title is required' } });
		expect(announcementsMock.create).not.toHaveBeenCalled();
	});

	it('maps create store failures to the existing failure shape', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.create.mockRejectedValueOnce(new Error('insert failed'));

		const result = await actions.create({
			request: makeRequest({ title: 'Readiness update', message: 'Brief at 0900', type: 'info' })
		} as unknown as Parameters<(typeof actions)['create']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to create announcement' } });
		expect(consoleError).toHaveBeenCalledWith('Failed to create announcement', expect.any(Error));
		consoleError.mockRestore();
	});

	it.each([
		['an invalid ID', { id: 'not-a-uuid', isActive: 'false' }, 'Invalid announcement ID'],
		['a missing desired state', { id: ANNOUNCEMENT_ID }, 'Invalid announcement state'],
		['an empty desired state', { id: ANNOUNCEMENT_ID, isActive: '' }, 'Invalid announcement state'],
		['a non-boolean desired state', { id: ANNOUNCEMENT_ID, isActive: 'TRUE' }, 'Invalid announcement state']
	])('rejects %s before calling the announcement use case', async (_name, form, error) => {
		const result = await actions.toggle({
			request: makeRequest(form)
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(result).toEqual({ status: 400, data: { error } });
		expect(announcementsMock.setActive).not.toHaveBeenCalled();
	});

	it('maps set-active store failures to the existing failure shape', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.setActive.mockRejectedValueOnce(new Error('update failed'));

		const result = await actions.toggle({
			request: makeRequest({ id: ANNOUNCEMENT_ID, isActive: 'false' })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to update announcement' } });
		consoleError.mockRestore();
	});

	it('maps set-active not-found through the existing user-facing failure shape', async () => {
		announcementsMock.setActive.mockResolvedValueOnce({ status: 'not_found' });

		const result = await actions.toggle({
			request: makeRequest({ id: ANNOUNCEMENT_ID, isActive: 'true' })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(result).toEqual({ status: 404, data: { error: 'Announcement not found' } });
	});

	it('rejects invalid delete IDs before calling the announcement use case', async () => {
		const result = await actions.delete({
			request: makeRequest({ id: 'not-a-uuid' })
		} as unknown as Parameters<(typeof actions)['delete']>[0]);

		expect(result).toEqual({ status: 400, data: { error: 'Invalid announcement ID' } });
		expect(announcementsMock.delete).not.toHaveBeenCalled();
	});

	it('maps delete store failures to the existing failure shape', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.delete.mockRejectedValueOnce(new Error('delete failed'));
		const failure = await actions.delete({
			request: makeRequest({ id: ANNOUNCEMENT_ID })
		} as unknown as Parameters<(typeof actions)['delete']>[0]);
		expect(failure).toEqual({ status: 500, data: { error: 'Failed to delete announcement' } });
		expect(consoleError).toHaveBeenCalledWith('Failed to delete announcement', expect.any(Error));
		consoleError.mockRestore();
	});
	it('reports each failed read as its own region without disclosing provider details', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.list.mockRejectedValueOnce(new Error('private provider failure'));
		announcementsMock.dismissalCounts.mockResolvedValueOnce({});
		const result = (await load({} as Parameters<typeof load>[0])) as unknown as PageData;
		await expect(result.banners).resolves.toEqual({ status: 'failed' });
		await expect(result.dismissals).resolves.toEqual({ status: 'loaded', counts: {} });
		consoleError.mockRestore();
	});

	it('keeps the banners when only the dismissal counts fail', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.list.mockResolvedValueOnce([]);
		announcementsMock.dismissalCounts.mockRejectedValueOnce(new Error('private provider failure'));
		const result = (await load({} as Parameters<typeof load>[0])) as unknown as PageData;
		await expect(result.banners).resolves.toEqual({ status: 'loaded', announcements: [] });
		await expect(result.dismissals).resolves.toEqual({ status: 'failed' });
		consoleError.mockRestore();
	});
});
