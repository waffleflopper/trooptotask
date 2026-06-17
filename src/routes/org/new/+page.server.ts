import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseOrgProvisioningPort } from '$lib/server/adapters/supabaseOrgProvisioning';
import { loadOrganizationProvisioning, provisionOrganization } from '$lib/server/core/useCases/orgProvisioning';

const EMAIL_CONFIRMATION_REQUIRED_MESSAGE = 'Confirm your email before creating an Organization.';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	if (!hasConfirmedEmail(locals.user)) {
		return {
			emailConfirmed: false,
			userEmail: locals.user.email ?? null,
			canCreate: false,
			canCreateMessage: EMAIL_CONFIRMATION_REQUIRED_MESSAGE
		};
	}

	const provisioning = await loadOrganizationProvisioning(createSupabaseOrgProvisioningPort(locals), {
		userId: locals.user.id
	});

	return {
		...provisioning,
		emailConfirmed: true,
		userEmail: locals.user.email ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');
		if (!hasConfirmedEmail(user)) {
			return fail(403, { error: EMAIL_CONFIRMATION_REQUIRED_MESSAGE });
		}

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

function hasConfirmedEmail(user: NonNullable<App.Locals['user']>): boolean {
	return Boolean(user.email && (hasTimestamp(user.email_confirmed_at) || hasTimestamp(user.confirmed_at)));
}

function hasTimestamp(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

function toActionFailure(error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { error: error.message });
	}

	throw error;
}
