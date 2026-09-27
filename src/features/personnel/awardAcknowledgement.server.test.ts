import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelAwardAcknowledgementPort } from './awardAcknowledgement.server';

function actor(personnel: 'view' | 'none', groupIds?: string[]) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none',
			personnel,
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		},
		scopeSet: groupIds ? { kind: 'groups', groupIds } : { kind: 'organization' }
	});
}

describe('Personnel award acknowledgement port', () => {
	it('reads the narrow badge projection for a Personnel viewer', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ personnel_id: 'person-1' }], error: null });
		const port = createSupabasePersonnelAwardAcknowledgementPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listAcknowledgedPersonnelIds(actor('view', ['alpha']))).resolves.toEqual(['person-1']);
		expect(rpc).toHaveBeenCalledWith('list_personnel_award_tracking_acknowledged', {
			p_organization_id: 'org-1'
		});
	});

	it('keeps the optional Dashboard badge empty without Personnel view or Groups', async () => {
		const rpc = vi.fn();
		const port = createSupabasePersonnelAwardAcknowledgementPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listAcknowledgedPersonnelIds(actor('none'))).resolves.toEqual([]);
		await expect(port.listAcknowledgedPersonnelIds(actor('view', []))).resolves.toEqual([]);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('propagates a failed SQL read', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
		const port = createSupabasePersonnelAwardAcknowledgementPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listAcknowledgedPersonnelIds(actor('view'))).rejects.toThrow('permission denied');
	});
});
