import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { validateUUID } from '$lib/server/validation';
import { createPlatformOrganizationMembershipCommands } from '$features/platform-admin/index.server';
import type { SensitiveActionFailureFields } from '$features/identity/contracts';
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

function commandFailure(cause: unknown, message: string) {
	if (cause instanceof Error) {
		const denial = cause as Error & Partial<SensitiveActionFailureFields> & { status?: number };
		if (denial.status === 403 && typeof denial.requiresStepUp === 'boolean') {
			return fail(403, {
				error: { message: denial.message },
				reason: denial.reason,
				requiresStepUp: denial.requiresStepUp,
				stepUpPath: denial.stepUpPath
			});
		}
	}
	return fail(503, { error: { message } });
}

export const actions: Actions = {
	makeAdmin: async (event) => {
		const commands = await createPlatformOrganizationMembershipCommands(event);
		const orgId = event.params.orgId;
		if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });
		const formData = await event.request.formData();
		const targetUserId = formData.get('targetUserId')?.toString() ?? '';
		if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });
		try {
			const result = await commands.makeAdmin({ orgId, targetUserId });
			switch (result.status) {
				case 'updated':
					return { success: true };
				case 'forbidden':
					return fail(403, { error: { message: 'Super-admin access is required' } });
				case 'organization_not_found':
					return fail(404, { error: { message: 'Organization not found' } });
				case 'target_not_member':
					return fail(400, { error: { message: 'Target user is not a member of this organization' } });
				case 'already_admin':
					return fail(400, { error: { message: 'Target user is already an admin' } });
				case 'already_owner':
					return fail(400, { error: { message: 'Target user is already the owner' } });
				case 'provider_error':
					return fail(503, {
						error: { message: 'Could not confirm the membership update. Reload this page before trying again.' }
					});
			}
		} catch (cause) {
			return commandFailure(cause, 'Could not confirm the membership update. Reload this page before trying again.');
		}
	},
	transferOwnership: async (event) => {
		const commands = await createPlatformOrganizationMembershipCommands(event);
		const orgId = event.params.orgId;
		if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });
		const formData = await event.request.formData();
		const targetUserId = formData.get('targetUserId')?.toString() ?? '';
		const confirmName = formData.get('confirmName')?.toString() ?? '';
		if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });
		try {
			const result = await commands.transferOwnership({ orgId, targetUserId, confirmName });
			switch (result.status) {
				case 'updated':
					return { success: true };
				case 'forbidden':
					return fail(403, { error: { message: 'Super-admin access is required' } });
				case 'organization_not_found':
					return fail(404, { error: { message: 'Organization not found' } });
				case 'name_mismatch':
					return fail(400, { error: { message: 'Organization name does not match' } });
				case 'target_not_member':
					return fail(400, { error: { message: 'Target user is not a member of this organization' } });
				case 'already_owner':
					return fail(400, { error: { message: 'Target user is already the owner' } });
				case 'no_current_owner':
				case 'multiple_current_owners':
					return fail(409, {
						error: { message: 'Ownership could not be verified. Contact support before trying again.' }
					});
				case 'provider_error':
					return fail(503, {
						error: { message: 'Could not confirm the transfer. Reload this page before trying again.' }
					});
			}
		} catch (cause) {
			return commandFailure(cause, 'Could not confirm the transfer. Reload this page before trying again.');
		}
	}
};
