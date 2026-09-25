import { recoveryPasswordPageState } from '$features/identity/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	return recoveryPasswordPageState(locals, cookies);
};
