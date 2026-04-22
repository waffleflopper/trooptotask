import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Deprecated fail-closed entrypoint. Keep `/demo` unavailable while the remaining
// demo/sandbox exceptions are contained and decommissioned; do not revive this by
// adding deeper auth or membership bypasses without an explicit retrofit slice.
export const load: PageServerLoad = async () => {
	throw redirect(303, '/auth/login?error=demo_unavailable');
};
