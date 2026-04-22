import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () =>
	json(
		{
			message: 'Demo sandbox creation is no longer available.'
		},
		{
			status: 403
		}
	);
