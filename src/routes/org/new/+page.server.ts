import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseOrgProvisioningPort } from '$lib/server/adapters/supabaseOrgProvisioning';
import { loadOrganizationProvisioning, provisionOrganization } from '$lib/server/core/useCases/orgProvisioning';
import {
	verifyCurrentUserEmailConfirmation,
	type CurrentUserEmailConfirmation
} from '$lib/server/currentUserEmailConfirmation';

const EMAIL_CONFIRMATION_REQUIRED_MESSAGE = 'Confirm your email before creating an Organization.';
const EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE = 'Unable to verify email confirmation right now. Try again in a moment.';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, locals.user);
	if (emailConfirmation.status !== 'confirmed') {
		return emailConfirmationLoadData(emailConfirmation);
	}

	const provisioning = await loadOrganizationProvisioning(createSupabaseOrgProvisioningPort(locals), {
		userId: locals.user.id
	});

	return {
		...provisioning,
		emailConfirmed: true,
		userEmail: emailConfirmation.email
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');
		const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, user);
		if (emailConfirmation.status === 'unconfirmed') {
			return fail(403, { error: EMAIL_CONFIRMATION_REQUIRED_MESSAGE });
		}
		if (emailConfirmation.status === 'unavailable') {
			return fail(503, { error: EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE });
		}

		const formData = await request.formData();
		let result: { orgId: string };

		try {
			result = await provisionOrganization(createSupabaseOrgProvisioningPort(locals), {
				name: (formData.get('name') as string) ?? '',
				userId: user.id,
				email: emailConfirmation.email
			});
		} catch (error) {
			return toActionFailure(error);
		}

		throw redirect(303, `/org/${result.orgId}`);
	}
};

function emailConfirmationLoadData(emailConfirmation: CurrentUserEmailConfirmation) {
	return {
		emailConfirmed: false,
		userEmail: emailConfirmation.email,
		canCreate: false,
		canCreateMessage:
			emailConfirmation.status === 'unavailable'
				? EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE
				: EMAIL_CONFIRMATION_REQUIRED_MESSAGE
	};
}

function toActionFailure(error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { error: error.message });
	}

	throw error;
}
