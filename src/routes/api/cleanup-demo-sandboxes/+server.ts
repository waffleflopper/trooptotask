import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
	const cleanupSecret = env.CLEANUP_SECRET;
	const cronSecret = env.CRON_SECRET; // Vercel Cron sends this automatically

	// Verify authorization - either via secret header or admin user
	const authHeader = request.headers.get('Authorization');
	const isCleanupSecretValid = cleanupSecret && authHeader === `Bearer ${cleanupSecret}`;
	const isCronSecretValid = cronSecret && authHeader === `Bearer ${cronSecret}`;

	// Also allow authenticated admin users
	const user = locals.user;
	const isAdmin = user?.email?.endsWith('@trooptotask.app');

	if (!isCleanupSecretValid && !isCronSecretValid && !isAdmin) {
		throw error(403, 'Unauthorized');
	}

	// Call the cleanup function
	const { data, error: dbError } = await locals.supabase.rpc('cleanup_expired_demo_sandboxes');

	if (dbError) {
		console.error('Error cleaning up sandboxes:', dbError);
		throw error(500, 'Failed to cleanup sandboxes');
	}

	return json({
		success: true,
		deletedCount: data
	});
};

// Also support GET for simple cron services
export const GET: RequestHandler = async ({ url, locals }) => {
	const cleanupSecret = env.CLEANUP_SECRET;

	// Check for secret in query param (for simple cron services)
	const secret = url.searchParams.get('secret');

	if (!cleanupSecret || secret !== cleanupSecret) {
		throw error(403, 'Unauthorized');
	}

	// Call the cleanup function
	const { data, error: dbError } = await locals.supabase.rpc('cleanup_expired_demo_sandboxes');

	if (dbError) {
		console.error('Error cleaning up sandboxes:', dbError);
		throw error(500, 'Failed to cleanup sandboxes');
	}

	return json({
		success: true,
		deletedCount: data
	});
};
