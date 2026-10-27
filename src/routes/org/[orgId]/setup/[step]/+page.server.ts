import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SETUP_STEPS } from '$features/organization/contracts';
import { loadSetupTeam } from '../teamLoad.server';

export const load: PageServerLoad = ({ params, locals, depends }) => {
	const step = SETUP_STEPS.find((entry) => entry.slug === params.step);
	if (!step) error(404, 'Setup step not found');
	if (step.key !== 'invite') return { setupStepKey: step.key };
	depends('app:organization-setup');
	return { setupStepKey: step.key, setupTeam: loadSetupTeam({ locals, params }) };
};
