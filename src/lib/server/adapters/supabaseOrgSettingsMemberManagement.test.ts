import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgSettingsMemberManagementPort } from './supabaseOrgSettingsMemberManagement';

type Call = { method: string; args: unknown[] };

function createMembershipLookupBuilder() {
	const calls: Call[] = [];
	const result = {
		data: {
			user_id: 'member-1',
			role: 'member',
			email: 'member@example.com'
		},
		error: null
	};

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

describe('createSupabaseOrgSettingsMemberManagementPort', () => {
	it('scopes membership lookups by both membership id and organization id', async () => {
		const { builder, calls } = createMembershipLookupBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.findMembershipById('org-1', 'membership-1');

		expect(result).toEqual({
			userId: 'member-1',
			role: 'member',
			email: 'member@example.com'
		});
		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'membership-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
	});
});
