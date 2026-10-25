import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
	redirect(
		308,
		url?.searchParams.get('tab') === 'reviewed' ? '/admin/people?filter=notSetUp' : '/admin?kind=accessRequest'
	);
