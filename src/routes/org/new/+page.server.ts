import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createOrganizationProvisioningDelivery } from '$lib/server/organizationProvisioningDelivery';
import { toActionFailure } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';
import { provisionOrganization } from '$features/organization/index.server';
import { verifyCurrentUserEmailConfirmation } from '$features/identity/index.server';
import type { CurrentUserEmailConfirmation } from '$features/identity/contracts';

const EMAIL_CONFIRMATION_REQUIRED_MESSAGE = 'Confirm your email before creating an Organization.';
const EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE = 'Unable to verify email confirmation right now. Try again in a moment.';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.actor || !locals.user) throw redirect(303, '/auth/login');

	const requestId = crypto.randomUUID();
	const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, {
		userId: locals.actor.userId,
		email: locals.user.email
	});
	if (emailConfirmation.status !== 'confirmed') {
		return emailConfirmationLoadData(emailConfirmation, requestId);
	}

	return {
		emailConfirmed: true,
		userEmail: emailConfirmation.email,
		emailConfirmationMessage: undefined,
		requestId
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!locals.actor || !user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const name = String(formData.get('name') ?? '');
		const submittedRequestId = String(formData.get('requestId') ?? '');
		// A page rendered before request ids existed still creates, without retry identity for that submission.
		const requestId = validateUUID(submittedRequestId) ? submittedRequestId : crypto.randomUUID();
		const retained = { name, requestId };

		const emailConfirmation = await verifyCurrentUserEmailConfirmation(locals, {
			userId: locals.actor.userId,
			email: user.email
		});
		if (emailConfirmation.status === 'unconfirmed') {
			return fail(403, { error: EMAIL_CONFIRMATION_REQUIRED_MESSAGE, ...retained });
		}
		if (emailConfirmation.status === 'unavailable') {
			return fail(503, { error: EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE, ...retained });
		}

		let result: { orgId: string };
		try {
			result = await provisionOrganization(createOrganizationProvisioningDelivery(locals), { name, requestId });
		} catch (error) {
			const failure = toActionFailure('error', error);
			return fail(failure.status, { error: String(failure.data.error), ...retained });
		}

		throw redirect(303, `/org/${result.orgId}/setup`);
	}
};

function emailConfirmationLoadData(emailConfirmation: CurrentUserEmailConfirmation, requestId: string) {
	return {
		emailConfirmed: false,
		requestId,
		userEmail: emailConfirmation.email,
		emailConfirmationMessage:
			emailConfirmation.status === 'unavailable'
				? EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE
				: EMAIL_CONFIRMATION_REQUIRED_MESSAGE
	};
}
