/**
 * Onboarding retention use case — auto-archives completed onboarding records after a grace period.
 *
 * `runOnboardingRetention(store, orgId)` is intended to be called as a background job or from a
 * scheduled cron. It finds onboarding records that completed beyond `org.retentionMonths` and archives
 * them, then notifies admins with a summary.
 *
 * This uses raw DataStore (not UseCaseContext) so it can run without a user session.
 */
import type { DataStore } from '$lib/server/core/ports';

interface OnboardingRow {
	id: string;
	organization_id: string;
	status: string;
	completed_at: string | null;
	cancelled_at: string | null;
}

interface OrgConfig {
	id: string;
	retentionMonths: number;
}

interface CleanupResult {
	deletedCount: number;
	orgsAffected: number;
}

interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

const RETENTION_DELETE_CHUNK_SIZE = 100;

function chunksOf<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function retentionCutoff(now: Date, retentionMonths: number): string {
	// Clamp month-end cutoffs to the target month's last day so UTC subtraction cannot roll into the next month.
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

async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
	excludeUserId: string | null,
	notification: NotificationPayload
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

export async function cleanupExpiredOnboardings(store: DataStore, orgConfigs: OrgConfig[]): Promise<CleanupResult> {
	if (orgConfigs.length === 0) {
		return { deletedCount: 0, orgsAffected: 0 };
	}

	const now = new Date();
	let totalDeleted = 0;
	const affectedOrgs = new Set<string>();

	for (const org of orgConfigs) {
		const cutoff = retentionCutoff(now, org.retentionMonths);
		const completed = await store.findMany<OnboardingRow>(
			'personnel_onboardings',
			org.id,
			{ status: 'completed' },
			{
				select: 'id, status, completed_at, cancelled_at',
				rangeFilters: [{ column: 'completed_at', op: 'lt', value: cutoff }],
				isNull: { completed_at: false }
			}
		);
		const cancelled = await store.findMany<OnboardingRow>(
			'personnel_onboardings',
			org.id,
			{ status: 'cancelled' },
			{
				select: 'id, status, completed_at, cancelled_at',
				rangeFilters: [{ column: 'cancelled_at', op: 'lt', value: cutoff }],
				isNull: { cancelled_at: false }
			}
		);

		const expiredIds = [...completed, ...cancelled].map((ob) => ob.id);
		if (expiredIds.length === 0) continue;

		let deletedCount = 0;
		for (const expiredIdChunk of chunksOf(expiredIds, RETENTION_DELETE_CHUNK_SIZE)) {
			const stepProgressFilters = expiredIdChunk.map((id) => ({ onboarding_id: id }));
			await store.deleteWhereAny('onboarding_step_progress', org.id, stepProgressFilters);
			deletedCount += await store.deleteManyByIds('personnel_onboardings', org.id, expiredIdChunk);
		}
		if (deletedCount === 0) continue;

		affectedOrgs.add(org.id);
		totalDeleted += deletedCount;

		await notifyAdminsViaStore(store, org.id, null, {
			type: 'onboarding_auto_deleted',
			title: 'Onboarding Records Auto-Deleted',
			message: `${deletedCount} onboarding record${deletedCount === 1 ? '' : 's'} auto-deleted after retention period`
		});
	}

	return {
		deletedCount: totalDeleted,
		orgsAffected: affectedOrgs.size
	};
}
