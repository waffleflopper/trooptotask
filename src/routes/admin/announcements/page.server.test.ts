import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { announcementsMock, createAnnouncementsMock } = vi.hoisted(() => {
	const announcements = {
		list: vi.fn(),
		create: vi.fn(),
		toggleActive: vi.fn(),
		delete: vi.fn()
	};

	return {
		announcementsMock: announcements,
		createAnnouncementsMock: vi.fn(() => announcements)
	};
});

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformAnnouncements', () => ({
	createSupabasePlatformAnnouncements: createAnnouncementsMock
}));

import { actions, load } from './+page.server';

const ANNOUNCEMENT_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/announcements', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

function makeContext() {
	return {
		adminUser: { id: 'admin-1', role: 'super_admin' },
		adminClient: {},
		sessionClient: {},
		session: null,
		audit: vi.fn()
	};
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
		announcementsMock.toggleActive.mockResolvedValue({ status: 'updated', id: ANNOUNCEMENT_ID, isActive: false });
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

		const result = (await load({
			__ctx: makeContext()
		} as unknown as Parameters<typeof load>[0])) as PageData;

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
		expect(createAnnouncementsMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
	});

	it('parses create form data and delegates creation to the use case', async () => {
		const result = await actions.create({
			__ctx: makeContext(),
			request: makeRequest({
				title: ' Readiness update ',
				message: ' Brief at 0900 ',
				type: 'warning',
				expiresAt: '2026-06-05T10:00'
			})
		} as unknown as Parameters<(typeof actions)['create']>[0]);

		expect(announcementsMock.create).toHaveBeenCalledWith({
			title: 'Readiness update',
			message: 'Brief at 0900',
			type: 'warning',
			expiresAt: '2026-06-05T10:00'
		});
		expect(result).toEqual({ success: true });
	});

	it('preserves validation failures before calling the announcement use case', async () => {
		const result = await actions.create({
			__ctx: makeContext(),
			request: makeRequest({ title: '', message: 'Missing title', type: 'info' })
		} as unknown as Parameters<(typeof actions)['create']>[0]);

		expect(result).toEqual({ status: 400, data: { error: 'Title is required' } });
		expect(announcementsMock.create).not.toHaveBeenCalled();
	});

	it('maps create store failures to the existing failure shape', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.create.mockRejectedValueOnce(new Error('insert failed'));

		const result = await actions.create({
			__ctx: makeContext(),
			request: makeRequest({ title: 'Readiness update', message: 'Brief at 0900', type: 'info' })
		} as unknown as Parameters<(typeof actions)['create']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to create announcement' } });
		expect(consoleError).toHaveBeenCalledWith('Failed to create announcement', expect.any(Error));
		consoleError.mockRestore();
	});

	it('delegates successful toggles and returns the existing success shape', async () => {
		const result = await actions.toggle({
			__ctx: makeContext(),
			request: makeRequest({ id: ANNOUNCEMENT_ID })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(announcementsMock.toggleActive).toHaveBeenCalledWith(ANNOUNCEMENT_ID);
		expect(result).toEqual({ success: true });
	});

	it('rejects invalid toggle IDs before calling the announcement use case', async () => {
		const result = await actions.toggle({
			__ctx: makeContext(),
			request: makeRequest({ id: 'not-a-uuid' })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(result).toEqual({ status: 400, data: { error: 'Invalid announcement ID' } });
		expect(announcementsMock.toggleActive).not.toHaveBeenCalled();
	});

	it('maps toggle not-found through the existing user-facing failure shape', async () => {
		announcementsMock.toggleActive.mockResolvedValueOnce({ status: 'not_found' });

		const result = await actions.toggle({
			__ctx: makeContext(),
			request: makeRequest({ id: ANNOUNCEMENT_ID })
		} as unknown as Parameters<(typeof actions)['toggle']>[0]);

		expect(announcementsMock.toggleActive).toHaveBeenCalledWith(ANNOUNCEMENT_ID);
		expect(result).toEqual({ status: 404, data: { error: 'Announcement not found' } });
	});

	it('rejects invalid delete IDs before calling the announcement use case', async () => {
		const result = await actions.delete({
			__ctx: makeContext(),
			request: makeRequest({ id: 'not-a-uuid' })
		} as unknown as Parameters<(typeof actions)['delete']>[0]);

		expect(result).toEqual({ status: 400, data: { error: 'Invalid announcement ID' } });
		expect(announcementsMock.delete).not.toHaveBeenCalled();
	});

	it('delegates delete and maps store failures to the existing failure shape', async () => {
		const success = await actions.delete({
			__ctx: makeContext(),
			request: makeRequest({ id: ANNOUNCEMENT_ID })
		} as unknown as Parameters<(typeof actions)['delete']>[0]);
		expect(success).toEqual({ success: true });
		expect(announcementsMock.delete).toHaveBeenCalledWith(ANNOUNCEMENT_ID);

		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		announcementsMock.delete.mockRejectedValueOnce(new Error('delete failed'));
		const failure = await actions.delete({
			__ctx: makeContext(),
			request: makeRequest({ id: ANNOUNCEMENT_ID })
		} as unknown as Parameters<(typeof actions)['delete']>[0]);
		expect(failure).toEqual({ status: 500, data: { error: 'Failed to delete announcement' } });
		expect(consoleError).toHaveBeenCalledWith('Failed to delete announcement', expect.any(Error));
		consoleError.mockRestore();
	});
});
