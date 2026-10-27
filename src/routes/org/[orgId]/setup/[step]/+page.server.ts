import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SETUP_STEPS } from '$features/organization/contracts';
import { loadSetupTeam } from '../teamLoad.server';
import { loadYourUnitStep } from '../yourUnitLoad.server';

export const load: PageServerLoad = async (event) => {
	const step = SETUP_STEPS.find((entry) => entry.slug === event.params.step);
	if (!step) error(404, 'Setup step not found');
	if (step.key === 'invite') {
		event.depends('app:organization-setup');
		return { setupStepKey: step.key, setupTeam: loadSetupTeam({ locals: event.locals, params: event.params }) };
	}
	return { setupStepKey: step.key, ...(await loadYourUnitStep(step.key, event)) };
};
