import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { assertCronEndpointAuthorized } from '$lib/server/cronEndpointAuth';

interface CleanupOldDataEndpointEnv {
	CLEANUP_SECRET?: string;
	CRON_SECRET?: string;
}

interface CleanupOldDataRpcResult {
	data: number | null;
	error: unknown;
}

export interface CleanupOldDataEndpointCoreInput {
	request: Request;
	env: CleanupOldDataEndpointEnv;
	runAuditCleanup: () => Promise<CleanupOldDataRpcResult>;
	runWebhookCleanup: () => Promise<CleanupOldDataRpcResult>;
}

export async function _runCleanupOldDataEndpointCore(input: CleanupOldDataEndpointCoreInput): Promise<Response> {
	assertCronEndpointAuthorized(input.request.headers.get('authorization'), [
		input.env.CLEANUP_SECRET,
		input.env.CRON_SECRET
	]);

	const [auditResult, webhookResult] = await Promise.all([input.runAuditCleanup(), input.runWebhookCleanup()]);

	if (auditResult.error || webhookResult.error) {
		throw error(500, 'Failed to cleanup old data');
	}

	return json({
		auditLogsDeleted: auditResult.data ?? 0,
		webhookEventsDeleted: webhookResult.data ?? 0
	});
}

export const GET: RequestHandler = async ({ request }) => {
	const admin = getAdminClient();

	return _runCleanupOldDataEndpointCore({
		request,
		env: {
			CLEANUP_SECRET: env.CLEANUP_SECRET,
			CRON_SECRET: env.CRON_SECRET
		},
		runAuditCleanup: async () => await admin.rpc('cleanup_old_audit_logs'),
		runWebhookCleanup: async () => await admin.rpc('cleanup_old_webhook_events')
	});
};
