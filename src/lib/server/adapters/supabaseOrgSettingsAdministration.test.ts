import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgSettingsAdministrationPort } from './supabaseOrgSettingsAdministration';

describe('createSupabaseOrgSettingsAdministrationPort', () => {
	it('calls the transfer ownership rpc with the organization and target user ids', async () => {
		const rpc = vi.fn().mockResolvedValue({ error: null });
		const port = createSupabaseOrgSettingsAdministrationPort({
			supabase: { rpc }
		} as never);

		const result = await port.transferOwnership('org-1', 'user-1');

		expect(result).toBeNull();
		expect(rpc).toHaveBeenCalledWith('transfer_org_ownership', {
			p_organization_id: 'org-1',
			p_new_owner_id: 'user-1'
		});
	});

	it('loads the organization name for destructive confirmation checks', async () => {
		const single = vi.fn().mockResolvedValue({
			data: { name: 'Alpha Company' },
			error: null
		});
		const eq = vi.fn().mockReturnValue({ single });
		const select = vi.fn().mockReturnValue({ eq });
		const from = vi.fn().mockReturnValue({ select });
		const port = createSupabaseOrgSettingsAdministrationPort({
			supabase: { from }
		} as never);

		const result = await port.lookupOrganization('org-1');

		expect(result).toEqual({ name: 'Alpha Company', errorMessage: null });
		expect(from).toHaveBeenCalledWith('organizations');
		expect(select).toHaveBeenCalledWith('name');
		expect(eq).toHaveBeenCalledWith('id', 'org-1');
	});

	it('deletes the organization row by id and returns provider errors as strings', async () => {
		const eq = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } });
		const remove = vi.fn().mockReturnValue({ eq });
		const from = vi.fn().mockReturnValue({ delete: remove });
		const port = createSupabaseOrgSettingsAdministrationPort({
			supabase: { from }
		} as never);

		const result = await port.deleteOrganization('org-1');

		expect(result).toBe('delete failed');
		expect(from).toHaveBeenCalledWith('organizations');
		expect(remove).toHaveBeenCalledWith();
		expect(eq).toHaveBeenCalledWith('id', 'org-1');
	});
});
