import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseOnboardingCalendarMarkersPort } from './calendarMarkers.server';

describe('Onboarding Calendar marker adapter', () => {
	it('returns only IDs from the scoped marker function', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: [{ personnel_id: 'person-1' }, { personnel_id: 'person-2' }],
			error: null
		});
		const port = createSupabaseOnboardingCalendarMarkersPort({ rpc } as unknown as SupabaseClient);

		expect(await port.listActivePersonnelIds('org-1')).toEqual(['person-1', 'person-2']);
		expect(rpc).toHaveBeenCalledWith('active_onboarding_calendar_personnel_ids', {
			p_organization_id: 'org-1'
		});
	});

	it('fails closed when the provider denies the marker read', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
		const port = createSupabaseOnboardingCalendarMarkersPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listActivePersonnelIds('org-1')).rejects.toThrow('permission denied');
	});
});
