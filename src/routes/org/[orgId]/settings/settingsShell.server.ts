import type { SettingsNavCounts } from '$features/organization/contracts';
import { readAdminAttention, type AdminAttentionContext } from '$features/organization/index.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';

export type SettingsNavCountsContext = Omit<AdminAttentionContext, 'readPendingApprovals'>;

/** The Settings badges are the totals of what the Dashboard lists as needing an admin, read once. */
export function streamSettingsNavCounts(
	ctx: SettingsNavCountsContext,
	readPendingApprovals: AdminAttentionContext['readPendingApprovals']
): SettingsNavCounts {
	const { approvals, invitations } = readAdminAttention({ ...ctx, readPendingApprovals });
	return {
		pendingInvitations: keepStreamedRejectionObserved(invitations.then((read) => read.pending)),
		pendingApprovals: keepStreamedRejectionObserved(
			approvals.then((groups) => groups.reduce((total, group) => total + group.count, 0))
		)
	};
}
