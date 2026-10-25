import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) =>
	redirect(303, `/account/feedback/${encodeURIComponent(params.feedbackId)}${url.search}`);
