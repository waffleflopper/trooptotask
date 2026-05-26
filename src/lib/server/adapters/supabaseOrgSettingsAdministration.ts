import type { OrganizationSettingsAdministrationPort } from '$lib/server/core/useCases/orgSettingsAdministration';

interface OrganizationRow {
	name: string | null;
}

interface OrganizationSlugRow {
	id: string;
}

interface OwnershipTransferTargetRow {
	user_id: string | null;
	email: string | null;
	role: string | null;
}

export function createSupabaseOrgSettingsAdministrationPort(
	locals: Pick<App.Locals, 'supabase'>
): OrganizationSettingsAdministrationPort {
	const supabase = locals.supabase;

	return {
		async renameOrganization(orgId, name) {
			const { error } = await supabase.from('organizations').update({ name }).eq('id', orgId);

			return error?.message ?? null;
		},

		async updateOrganizationUrlSlug(orgId, urlSlug) {
			const { error } = await supabase.from('organizations').update({ url_slug: urlSlug }).eq('id', orgId);

			return error?.message ?? null;
		},

		async findOrganizationByUrlSlug(urlSlug) {
			const { data, error } = await supabase
				.from('organizations')
				.select('id')
				.eq('url_slug', urlSlug)
				.maybeSingle<OrganizationSlugRow>();

			if (error) {
				throw new Error(error.message);
			}

			return data ? { id: data.id } : null;
		},

		async findOwnershipTransferTarget(orgId, userId) {
			const { data, error } = await supabase
				.from('organization_memberships')
				.select('user_id, email, role')
				.eq('organization_id', orgId)
				.eq('user_id', userId)
				.maybeSingle<OwnershipTransferTargetRow>();

			if (error) {
				throw new Error(error.message);
			}

			return data ? { userId: data.user_id, email: data.email, role: data.role } : null;
		},

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
