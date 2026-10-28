import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import type { PersonnelLifecycleCommandPort } from './contracts';

async function command(supabase: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
	const { data, error } = await supabase.rpc(name, args);
	if (error) {
		if (error.code === 'P0002') fail(404, error.message);
		if (error.code === '42501') fail(403, error.message);
		throw new Error(error.message);
	}
	return data;
}

export function createSupabasePersonnelLifecycleCommands(
	supabase: SupabaseClient,
	orgId: string
): PersonnelLifecycleCommandPort {
	return {
		async archive(personnelIds, archivedAt) {
			const ids = [...new Set(personnelIds.map((id) => id.toLowerCase()))];
			const covered = await command(supabase, 'archive_personnel', {
				p_organization_id: orgId,
				p_personnel_ids: ids,
				p_archived_at: archivedAt
			});
			if (covered !== ids.length) throw new Error('Personnel archive was not acknowledged');
		},
		async restore(personnelId) {
			const restored = await command(supabase, 'restore_personnel', {
				p_organization_id: orgId,
				p_personnel_id: personnelId
			});
			if (typeof restored !== 'boolean') throw new Error('Personnel restore was not acknowledged');
			return restored;
		},
		async approveArchiveRequest(requestId, personnelId, reviewedAt) {
			const approved = await command(supabase, 'approve_personnel_archive_request', {
				p_organization_id: orgId,
				p_request_id: requestId,
				p_personnel_id: personnelId,
				p_reviewed_at: reviewedAt
			});
			if (approved !== true) throw new Error('Personnel archive approval was not acknowledged');
		}
	};
}
