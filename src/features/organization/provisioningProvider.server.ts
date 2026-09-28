import type { OrgProvisioningCreateResult, OrgProvisioningPort } from './provisioning.server';

export function createSupabaseOrganizationCreationPort(
	locals: Pick<App.Locals, 'supabase'>
): Pick<OrgProvisioningPort, 'createOrganizationWithOwner' | 'updateOwnerMembershipEmail'> {
	const supabase = locals.supabase;

	return {
		async createOrganizationWithOwner(name): Promise<OrgProvisioningCreateResult> {
			const { data, error } = await supabase.rpc('create_org_with_owner', { p_name: name });

			return {
				orgId: data ?? null,
				errorMessage: error?.message ?? null
			};
		},

		async updateOwnerMembershipEmail(input) {
			const { error } = await supabase
				.from('organization_memberships')
				.update({ email: input.email })
				.eq('organization_id', input.organizationId)
				.eq('user_id', input.userId);

			return error?.message ?? null;
		}
	};
}
