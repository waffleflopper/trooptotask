import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const cleanupSecret = env.CLEANUP_SECRET;
	const cronSecret = env.CRON_SECRET;

	const isAuthorized = authHeader === `Bearer ${cleanupSecret}` || authHeader === `Bearer ${cronSecret}`;

	if (!isAuthorized) {
		throw error(401, 'Unauthorized');
	}

	const admin = getAdminClient();

	const [auditResult, webhookResult] = await Promise.all([
		admin.rpc('cleanup_old_audit_logs'),
		admin.rpc('cleanup_old_webhook_events')
	]);

	return json({
		auditLogsDeleted: auditResult.data ?? 0,
		webhookEventsDeleted: webhookResult.data ?? 0
	});
};
