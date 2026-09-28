import type { OrganizationOwnershipTransferPort } from './ownershipTransfer.server';

interface OwnershipTransferTargetRow {
	user_id: string | null;
	email: string | null;
	role: string | null;
}

interface OrganizationRow {
	name: string | null;
}

export function createSupabaseOrganizationOwnershipTransferPort(
	locals: Pick<App.Locals, 'supabase'>
): OrganizationOwnershipTransferPort {
	const supabase = locals.supabase;

	return {
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
		}
	};
}
