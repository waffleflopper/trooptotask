import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SETUP_STEPS } from '$features/organization/contracts';

export const load: PageServerLoad = ({ params }) => {
	const step = SETUP_STEPS.find((entry) => entry.slug === params.step);
	if (!step) error(404, 'Setup step not found');
	return { setupStepKey: step.key };
};
