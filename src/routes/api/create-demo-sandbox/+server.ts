import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ cookies }) => {
	// Use service role client to bypass RLS for sandbox creation
	const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
		auth: { persistSession: false }
	});

	// Generate a unique session ID for this sandbox
	const sessionId = crypto.randomUUID();

	// Call the database function to create the sandbox
	const { data, error: dbError } = await supabase.rpc('create_demo_sandbox', {
		p_session_id: sessionId
	});

	if (dbError) {
		console.error('Error creating demo sandbox:', dbError);
		throw error(500, 'Failed to create demo sandbox. Please try again.');
	}

	const sandboxOrgId = data;

	if (!sandboxOrgId) {
		throw error(500, 'Failed to create demo sandbox. No organization ID returned.');
	}

	// Clear the read-only demo cookie
	cookies.delete('demo_mode', { path: '/' });

	// Set a cookie to identify this sandbox session
	cookies.set('demo_sandbox', JSON.stringify({ orgId: sandboxOrgId, sessionId }), {
		path: '/',
		maxAge: 60 * 60, // 1 hour (matches sandbox lifetime)
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production'
	});

	return json({
		success: true,
		orgId: sandboxOrgId,
		expiresIn: '1 hour'
	});
};
