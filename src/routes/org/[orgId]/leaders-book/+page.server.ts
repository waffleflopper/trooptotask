import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	// Intentionally not migrated in the secondary-route design pass: the Leaders Book route
	// is still redirected while its ground-up rebuild is in progress.
	redirect(303, `/org/${params.orgId}`);
};
