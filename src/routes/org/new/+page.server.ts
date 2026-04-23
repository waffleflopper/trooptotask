import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseOrgProvisioningPort } from '$lib/server/adapters/supabaseOrgProvisioning';
import { loadOrganizationProvisioning, provisionOrganization } from '$lib/server/core/useCases/orgProvisioning';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	return loadOrganizationProvisioning(createSupabaseOrgProvisioningPort(locals), {
		userId: locals.user.id
	});
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		let result: { orgId: string };

		try {
			result = await provisionOrganization(createSupabaseOrgProvisioningPort(locals), {
				name: (formData.get('name') as string) ?? '',
				userId: user.id,
				email: user.email
			});
		} catch (error) {
			return toActionFailure(error);
		}

		throw redirect(303, `/org/${result.orgId}`);
	}
};

function toActionFailure(error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { error: error.message });
	}

	throw error;
}
