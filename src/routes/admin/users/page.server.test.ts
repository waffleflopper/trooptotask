import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platformUserDirectoryMock } = vi.hoisted(() => ({
	platformUserDirectoryMock: {
		listUsers: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformUserDirectory', () => ({
	createSupabasePlatformUserDirectory: () => platformUserDirectoryMock
}));

import { load } from './+page.server';

function makeContext() {
	return {
		adminClient: {
			auth: {
				admin: {
					listUsers: vi.fn(() => {
						throw new Error('route must use PlatformUserDirectory for user list shaping');
					})
				}
			},
			from: vi.fn((table: string) => {
				throw new Error(`route must not shape ${table} rows directly`);
			})
		},
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

describe('admin users route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		platformUserDirectoryMock.listUsers.mockResolvedValue({
			users: [
				{
					id: 'user-1',
					email: 'soldier@example.test',
					organizationCount: 2,
					createdAt: '2026-06-01T00:00:00.000Z',
					isSuspended: false
				}
			],
			totalCount: 1,
			page: 2,
			limit: 20,
			search: 'soldier',
			authError: null
		});
	});

	it('loads the user directory through PlatformUserDirectory', async () => {
		const result = await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/users?search=soldier&page=2')
		} as unknown as Parameters<typeof load>[0]);

		expect(platformUserDirectoryMock.listUsers).toHaveBeenCalledWith({
			search: 'soldier',
			page: 2,
			limit: 20
		});
		expect(result).toEqual({
			users: [
				{
					id: 'user-1',
					email: 'soldier@example.test',
					organizationCount: 2,
					createdAt: '2026-06-01T00:00:00.000Z',
					isSuspended: false
				}
			],
			totalCount: 1,
			page: 2,
			limit: 20,
			search: 'soldier',
			authError: null
		});
	});

	it('normalizes malformed page filters before calling the directory seam', async () => {
		await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/users?search=soldier&page=abc')
		} as unknown as Parameters<typeof load>[0]);

		expect(platformUserDirectoryMock.listUsers).toHaveBeenCalledWith({
			search: 'soldier',
			page: 1,
			limit: 20
		});
	});
});
