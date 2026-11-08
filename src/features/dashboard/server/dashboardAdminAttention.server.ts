import type { AdminAttentionSnapshot } from '$features/organization/contracts';
import { readAdminAttentionSnapshot, type AdminAttentionContext } from '$features/organization/index.server';

/** Null for anyone but an owner or admin, whose Dashboard has no such rows; their readers are never called. */
export async function fetchDashboardAdminAttention(ctx: AdminAttentionContext): Promise<AdminAttentionSnapshot | null> {
	if (ctx.auth.role !== 'owner' && ctx.auth.role !== 'admin') return null;
	return readAdminAttentionSnapshot(ctx);
}
