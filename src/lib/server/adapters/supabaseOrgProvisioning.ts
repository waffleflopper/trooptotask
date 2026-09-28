import type { OrgProvisioningCreateResult, OrgProvisioningPort } from '$lib/server/core/useCases/orgProvisioning';

export function createSupabaseOrgProvisioningPort(
	locals: Pick<App.Locals, 'supabase'>,
	seedGroups: OrgProvisioningPort['seedDefaultGroups'],
	seedRankCatalog: OrgProvisioningPort['seedDefaultRankCatalog'],
	seedHolidays: OrgProvisioningPort['seedFederalHolidays'],
	seedStatuses: OrgProvisioningPort['seedDefaultStatusTypes'],
	seedAssignmentTypes: OrgProvisioningPort['seedDefaultAssignmentTypes']
): OrgProvisioningPort {
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
		},

		async seedDefaultGroups(organizationId) {
			return seedGroups(organizationId);
		},

		async seedDefaultStatusTypes(organizationId) {
			return seedStatuses(organizationId);
		},

		async seedDefaultAssignmentTypes(organizationId) {
			return seedAssignmentTypes(organizationId);
		},

		async seedFederalHolidays(organizationId) {
			return seedHolidays(organizationId);
		},

		async seedDefaultRankCatalog(organizationId) {
			return seedRankCatalog(organizationId);
		}
	};
}
