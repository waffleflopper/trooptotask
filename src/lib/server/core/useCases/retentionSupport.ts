import type { DataStore } from '$lib/server/core/ports';

export interface RetentionNotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

export interface ArchiveRetentionSettingsRow {
	id: string;
	archive_retention_months: number | null;
}

export interface RetentionOrgConfig {
	id: string;
	retentionMonths: number | null;
}

export async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
	excludeUserId: string | null,
	notification: RetentionNotificationPayload
): Promise<void> {
	const admins = await store.findMany<{ user_id: string; role: string }>(
		'organization_memberships',
		orgId,
		{},
		{
			inFilters: { role: ['owner', 'admin'] }
		}
	);

	const rows = admins
		.filter((adm) => !excludeUserId || adm.user_id !== excludeUserId)
		.map((adm) => ({
			user_id: adm.user_id,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		}));

	if (rows.length > 0) {
		await store.insertMany('notifications', orgId, rows);
	}
}

export function retentionCutoff(now: Date, retentionMonths: number): string {
	const targetMonthStart = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth() - retentionMonths,
			1,
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds()
		)
	);
	const lastTargetMonthDay = new Date(
		Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)
	).getUTCDate();
	const cutoff = new Date(
		Date.UTC(
			targetMonthStart.getUTCFullYear(),
			targetMonthStart.getUTCMonth(),
			Math.min(now.getUTCDate(), lastTargetMonthDay),
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds()
		)
	);
	return cutoff.toISOString();
}

export function mapArchiveRetentionOrgConfigs(orgs: ArchiveRetentionSettingsRow[]): RetentionOrgConfig[] {
	return orgs.map((org) => ({
		id: org.id,
		retentionMonths: org.archive_retention_months
	}));
}
