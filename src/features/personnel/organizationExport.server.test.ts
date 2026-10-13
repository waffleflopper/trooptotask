import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelOrganizationExportPort } from './organizationExport.server';

function actor(role: 'member' | 'admin', canManageMembers = role === 'admin') {
	return createTestAuthContext({
		orgId: 'org-1',
		role,
		isPrivileged: role === 'admin',
		canManageMembers,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

describe('Organization export of Personnel history', () => {
	it('denies members, including legacy member managers, and unsupported tables before opening the privileged client', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelOrganizationExportPort(getAdminClient);
		await expect(port.listRows(actor('member'), 'leader_notes')).rejects.toMatchObject({ status: 403 });
		await expect(port.listRows(actor('member', true), 'leader_notes')).rejects.toMatchObject({ status: 403 });
		await expect(port.listRows(actor('admin'), 'personnel' as 'leader_notes')).rejects.toMatchObject({ status: 400 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('paginates tenant-bound rows for an admin', async () => {
		const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `note-${index}`, organization_id: 'org-1' }));
		const query = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			range: vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }))
		};
		const from = vi.fn(() => query);
		const getAdminClient = vi.fn(() => ({ from }) as unknown as SupabaseClient);
		const result = await createSupabasePersonnelOrganizationExportPort(getAdminClient).listRows(
			actor('admin'),
			'leader_notes'
		);
		expect(result).toEqual(rows);
		expect(getAdminClient).toHaveBeenCalledTimes(1);
		expect(from).toHaveBeenCalledWith('leader_notes');
		expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
		expect(query.range.mock.calls).toEqual([
			[0, 999],
			[1000, 1999]
		]);
	});
});
