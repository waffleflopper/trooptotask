import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseOrgProvisioningPort } from '$lib/server/adapters/supabaseOrgProvisioning';
import { provisionOrganization } from '$lib/server/core/useCases/orgProvisioning';
import { verifyCurrentUserEmailConfirmation } from '$features/identity/index.server';
import type { CurrentUserEmailConfirmation } from '$features/identity/contracts';

const EMAIL_CONFIRMATION_REQUIRED_MESSAGE = 'Confirm your email before creating an Organization.';
const EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE = 'Unable to verify email confirmation right now. Try again in a moment.';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.actor || !locals.user) throw redirect(303, '/auth/login');

	const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, {
		userId: locals.actor.userId,
		email: locals.user.email
	});
	if (emailConfirmation.status !== 'confirmed') {
		return emailConfirmationLoadData(emailConfirmation);
	}

	return {
		emailConfirmed: true,
		userEmail: emailConfirmation.email,
		emailConfirmationMessage: undefined
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!locals.actor || !user) throw redirect(303, '/auth/login');
		const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, {
			userId: locals.actor.userId,
			email: user.email
		});
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
				userId: locals.actor.userId,
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
		emailConfirmationMessage:
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
