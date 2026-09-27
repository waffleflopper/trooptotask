import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelOrganizationExportPort } from './organizationExport.server';

function actor(canManageMembers: boolean) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
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
	it('denies ordinary members and unsupported tables before opening the privileged client', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelOrganizationExportPort(getAdminClient);
		await expect(port.listRows(actor(false), 'leader_notes')).rejects.toMatchObject({ status: 403 });
		await expect(port.listRows(actor(true), 'personnel' as 'leader_notes')).rejects.toMatchObject({ status: 400 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('paginates tenant-bound rows for a member manager without Personnel capability', async () => {
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
			actor(true),
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
