import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ cookies }) => {
	// Use service role client to bypass RLS for finding the showcase org
	const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
		auth: { persistSession: false }
	});

	// Find the showcase organization
	const { data: showcaseOrg } = await supabase.from('organizations').select('id').eq('demo_type', 'showcase').single();

	if (!showcaseOrg) {
		// No showcase org found - redirect to login with error
		throw redirect(303, '/auth/login?error=demo_unavailable');
	}

	// Set a cookie to indicate demo mode (expires in 1 hour)
	cookies.set('demo_mode', 'readonly', {
		path: '/',
		maxAge: 60 * 60, // 1 hour
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production'
	});

	// Redirect to the showcase org
	throw redirect(303, `/org/${showcaseOrg.id}`);
};
