import type { OrganizationSettingsAdministrationPort } from '$lib/server/core/useCases/orgSettingsAdministration';

interface OrganizationRow {
	name: string | null;
}

export function createSupabaseOrgSettingsAdministrationPort(
	locals: Pick<App.Locals, 'supabase'>
): OrganizationSettingsAdministrationPort {
	const supabase = locals.supabase;

	return {
		async transferOwnership(orgId, newOwnerId) {
			const { error } = await supabase.rpc('transfer_org_ownership', {
				p_organization_id: orgId,
				p_new_owner_id: newOwnerId
			});

			return error?.message ?? null;
		},

		async lookupOrganization(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('name')
				.eq('id', orgId)
				.single<OrganizationRow>();

			return {
				name: data?.name ?? null,
				errorMessage: error?.message ?? null
			};
		},

		async deleteOrganization(orgId) {
			const { error } = await supabase.from('organizations').delete().eq('id', orgId);

			return error?.message ?? null;
		}
	};
}
