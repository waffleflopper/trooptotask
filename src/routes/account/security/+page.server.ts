import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	const { data: factors } = await locals.supabase.auth.mfa.listFactors();
	const totpFactors = factors?.totp ?? [];
	const hasMFA = totpFactors.some((f: Record<string, unknown>) => f.status === 'verified');

	return { hasMFA };
};
