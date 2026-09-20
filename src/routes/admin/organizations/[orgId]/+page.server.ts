import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { validateUUID } from '$lib/server/validation';
import { createSupabasePlatformMembershipAdministration } from '$lib/server/adapters/supabasePlatformMembershipAdministration';
import { createSupabasePlatformOrganizationDetail } from '$lib/server/adapters/supabasePlatformOrganizationDetail';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		const orgId = event.params.orgId as string;
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const result = await createSupabasePlatformOrganizationDetail(ctx).getOrganizationDetail(orgId);
		if (result.status === 'not_found') throw error(404, 'Organization not found');
		if (result.status === 'provider_error') throw error(500, 'Failed to load organization detail');

		return result.detail;
	}
});

export const actions: Actions = {
	makeAdmin: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const targetUserId = formData.get('targetUserId')?.toString() ?? '';
			if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

			try {
				const result = await createSupabasePlatformMembershipAdministration(ctx).makeAdmin({ orgId, targetUserId });

				switch (result.status) {
					case 'updated':
						return { success: true };
					case 'target_not_member':
						return fail(400, { error: { message: 'Target user is not a member of this organization' } });
					case 'already_admin':
						return fail(400, { error: { message: 'Target user is already an admin' } });
					case 'already_owner':
						return fail(400, { error: { message: 'Target user is already the owner' } });
				}
			} catch {
				return fail(500, { error: { message: 'Failed to update membership' } });
			}
		}
	}),

	transferOwnership: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const targetUserId = formData.get('targetUserId')?.toString() ?? '';
			const confirmName = formData.get('confirmName')?.toString() ?? '';

			if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

			try {
				const result = await createSupabasePlatformMembershipAdministration(ctx).transferOwnership({
					orgId,
					targetUserId,
					confirmName
				});

				switch (result.status) {
					case 'updated':
						return { success: true };
					case 'organization_not_found':
						return fail(404, { error: { message: 'Organization not found' } });
					case 'name_mismatch':
						return fail(400, { error: { message: 'Organization name does not match' } });
					case 'target_not_member':
						return fail(400, { error: { message: 'Target user is not a member of this organization' } });
					case 'already_owner':
						return fail(400, { error: { message: 'Target user is already the owner' } });
					case 'no_current_owner':
						return fail(500, { error: { message: 'Could not find current owner' } });
					case 'current_owner_lookup_failed':
						return fail(500, { error: { message: 'Could not verify current owner' } });
					case 'demotion_failed':
						return fail(500, { error: { message: 'Transfer failed during demotion' } });
					case 'promotion_failed':
						return fail(500, { error: { message: 'Transfer failed during promotion' } });
					case 'rollback_failed':
						return fail(500, {
							error: { message: 'Transfer failed during promotion; original owner could not be restored automatically' }
						});
				}
			} catch {
				return fail(500, { error: { message: 'Transfer failed' } });
			}
		}
	})
};
