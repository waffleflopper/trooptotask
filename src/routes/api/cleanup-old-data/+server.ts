import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';

export const GET: RequestHandler = async ({ request }) => {
	assertCronEndpointAuthorized(request.headers.get('authorization'), [env.CLEANUP_SECRET, env.CRON_SECRET]);

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
