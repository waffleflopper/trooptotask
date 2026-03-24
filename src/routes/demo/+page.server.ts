import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// TODO: Demo mode needs adapter-layer support — sub-page loaders call
// loadWithContext/handle() which require a real membership. Re-enable
// once the adapter layer can bypass membership checks for demo sessions.
export const load: PageServerLoad = async () => {
	throw redirect(303, '/auth/login?error=demo_unavailable');
};
