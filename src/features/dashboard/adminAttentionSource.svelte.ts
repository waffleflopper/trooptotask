import type { AdminAttentionSnapshot } from '$features/organization/contracts';
import { DashboardSource } from './dashboardSource.svelte';

/** What waits on an owner or admin: pending approvals and invitations that need a nudge. */
export class DashboardAdminAttentionSource extends DashboardSource<AdminAttentionSnapshot> {
	constructor() {
		super((orgId) => `/org/${orgId}/api/dashboard/admin-attention`, 'Failed to load administration items');
	}
}
