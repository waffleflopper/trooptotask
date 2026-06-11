import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminHandleCore, type AdminContext } from '$lib/server/adapters/adminAdapter';
import { _getConfig } from './+server';

const { searchMock } = vi.hoisted(() => ({
	searchMock: vi.fn()
}));

vi.mock('$lib/server/adapters/supabasePlatformAdministration', () => ({
	createSupabasePlatformAdministration: () => ({
		search: searchMock
	})
}));

function makeCtx(role: AdminContext['adminUser']['role']): AdminContext {
	return {
		adminUser: { id: 'admin-1', role },
		adminClient: {} as AdminContext['adminClient'],
		sessionClient: {} as AdminContext['sessionClient'],
		session: null,
		audit: vi.fn()
	};
}

describe('GET /admin/api/search', () => {
	beforeEach(() => {
		searchMock.mockReset();
		searchMock.mockResolvedValue({ users: [], organizations: [] });
	});

	it('rejects billing-only admins before executing global search', async () => {
		await expect(adminHandleCore(makeCtx('billing'), _getConfig, 'alpha')).rejects.toThrow(/not authorized/i);
		expect(searchMock).not.toHaveBeenCalled();
	});

	it('allows support admins to execute global search', async () => {
		await adminHandleCore(makeCtx('support'), _getConfig, 'alpha');

		expect(searchMock).toHaveBeenCalledWith({ query: 'alpha' });
	});

	it('allows super admins to execute global search', async () => {
		await adminHandleCore(makeCtx('super_admin'), _getConfig, 'bravo');

		expect(searchMock).toHaveBeenCalledWith({ query: 'bravo' });
	});
});
