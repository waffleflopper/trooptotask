import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const cleanupSecret = env.CLEANUP_SECRET;
	const cronSecret = env.CRON_SECRET;

	const isAuthorized =
		(authHeader === `Bearer ${cleanupSecret}`) ||
		(authHeader === `Bearer ${cronSecret}`);

	if (!isAuthorized) {
		throw error(401, 'Unauthorized');
	}

	const admin = getAdminClient();

	// Find all archived personnel joined with their org's retention setting
	const { data: expiredPersonnel, error: queryError } = await admin
		.from('personnel')
		.select('id, rank, first_name, last_name, organization_id, archived_at, organizations!inner(archive_retention_months)')
		.not('archived_at', 'is', null);

	if (queryError) {
		throw error(500, queryError.message);
	}

	const now = new Date();
	const toDelete = (expiredPersonnel ?? []).filter((p: any) => {
		const archivedAt = new Date(p.archived_at);
		const retentionMonths = p.organizations?.archive_retention_months ?? 36;
		const expiresAt = new Date(archivedAt);
		expiresAt.setMonth(expiresAt.getMonth() + retentionMonths);
		return now > expiresAt;
	});

	if (toDelete.length === 0) {
		return json({ deletedCount: 0, orgsAffected: 0 });
	}

	// Group by org for notifications
	const byOrg = new Map<string, Array<{ id: string; name: string }>>();
	for (const p of toDelete as any[]) {
		const orgId = p.organization_id;
		if (!byOrg.has(orgId)) byOrg.set(orgId, []);
		byOrg.get(orgId)!.push({
			id: p.id,
			name: `${p.rank} ${p.last_name}, ${p.first_name}`
		});
	}

	// Delete expired personnel
	const idsToDelete = toDelete.map((p: any) => p.id);
	const { error: deleteError } = await admin
		.from('personnel')
		.delete()
		.in('id', idsToDelete);

	if (deleteError) {
		throw error(500, deleteError.message);
	}

	// Create notifications for org admins/owners
	for (const [orgId, people] of byOrg.entries()) {
		const { data: admins } = await admin
			.from('organization_memberships')
			.select('user_id')
			.eq('organization_id', orgId)
			.in('role', ['owner', 'admin']);

		const nameList = people.map(p => p.name).join(', ');
		const message = `${people.length} archived personnel auto-deleted after retention period: ${nameList}`;

		for (const adm of (admins ?? [])) {
			await admin.from('notifications').insert({
				user_id: adm.user_id,
				organization_id: orgId,
				type: 'archive_auto_deleted',
				title: 'Archived Personnel Auto-Deleted',
				message,
				link: null
			});
		}
	}

	return json({
		deletedCount: idsToDelete.length,
		orgsAffected: byOrg.size
	});
};
