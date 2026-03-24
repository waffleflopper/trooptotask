import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateSuspendRequest } from '$lib/server/admin';
import { adminHandle } from '$lib/server/adapters/adminAdapter';

export const POST: RequestHandler = adminHandle({
	requiredRole: 'super_admin',
	fn: async (ctx, body) => {
		const { adminClient } = ctx;
		const validation = validateSuspendRequest(
			body as { type: string; targetId: string; action: string; reason?: string }
		);
		if (!validation.valid) throw error(400, validation.error ?? 'Invalid request');

		const { type, targetId, action, reason } = validation;

		if (type === 'user') {
			if (action === 'suspend') {
				const { error: dbError } = await adminClient
					.from('user_suspensions')
					.upsert({ user_id: targetId, suspended_by: ctx.adminUser.id, reason });
				if (dbError) throw error(500, 'Operation failed');
			} else {
				const { error: dbError } = await adminClient.from('user_suspensions').delete().eq('user_id', targetId);
				if (dbError) throw error(500, 'Operation failed');
			}
		} else {
			if (action === 'suspend') {
				const { error: dbError } = await adminClient
					.from('organizations')
					.update({ suspended_at: new Date().toISOString() })
					.eq('id', targetId);
				if (dbError) throw error(500, 'Operation failed');
			} else {
				const { error: dbError } = await adminClient
					.from('organizations')
					.update({ suspended_at: null })
					.eq('id', targetId);
				if (dbError) throw error(500, 'Operation failed');
			}
		}

		ctx.audit({
			action: `${action}_${type}`,
			resourceType: type === 'user' ? 'user' : 'organization',
			resourceId: targetId,
			details: { reason },
			severity: 'critical'
		});

		return { success: true };
	}
});
