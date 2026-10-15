import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { PageData } from './$types';

const { announcementsMock, createAnnouncementsMock } = vi.hoisted(() => {
	const announcements = {
		list: vi.fn(),
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
		announcementsMock.list.mockResolvedValue([]);
		announcementsMock.create.mockResolvedValue({
			id: ANNOUNCEMENT_ID,
			title: 'Readiness update',
			message: 'Brief at 0900',
			type: 'info',
			isActive: true,
			createdAt: '2026-06-03T10:00:00.000Z',
			expiresAt: null
		});
		announcementsMock.setActive.mockResolvedValue({ status: 'updated', id: ANNOUNCEMENT_ID, isActive: false });
		announcementsMock.delete.mockResolvedValue({ success: true });
	});

	it('load returns the PlatformAnnouncements list model in the existing page shape', async () => {
		announcementsMock.list.mockResolvedValueOnce([
			{
				id: ANNOUNCEMENT_ID,
				title: 'Readiness update',
				message: 'Brief at 0900',
				type: 'info',
				isActive: true,
				createdAt: '2026-06-03T10:00:00.000Z',
				expiresAt: null
			}
		]);

		const result = (await load({} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result).toEqual({
			announcements: [
				{
					id: ANNOUNCEMENT_ID,
					title: 'Readiness update',
					message: 'Brief at 0900',
					type: 'info',
					is_active: true,
					created_at: '2026-06-03T10:00:00.000Z',
					expires_at: null
				}
			]
		});
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

	it.each([
		['true', true],
		['false', false]
	])('sets the submitted desired state %s exactly once', async (isActive, expected) => {
		const result = await actions.toggle({
			request: makeRequest({ id: ANNOUNCEMENT_ID, isActive })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(result).toEqual({ success: true });
		expect(announcementsMock.setActive.mock.calls).toEqual([[ANNOUNCEMENT_ID, expected]]);
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
	it('reports a failed collection read without disclosing provider details', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.list.mockRejectedValueOnce(new Error('private provider failure'));
		try {
			await load({} as Parameters<typeof load>[0]);
			expect.unreachable('Expected failed collection load');
		} catch (cause) {
			expect(isHttpError(cause, 500)).toBe(true);
			if (!isHttpError(cause)) throw cause;
			expect(cause.body.message).not.toContain('private provider');
		} finally {
			consoleError.mockRestore();
		}
	});
});
