import { passwordCompletionState } from '$features/identity/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Use hook-verified identity, not an unverified provider cookie session.
	const hasSession = !!locals.user && locals.session?.user.id === locals.user.id;
	const invitePending = hasSession && locals.authFlow === 'invite';
	return {
		hasSession,
		invitePending,
		passwordCompletion: invitePending ? await passwordCompletionState(locals) : null
	};
};
