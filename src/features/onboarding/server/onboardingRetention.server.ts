/**
 * Onboarding retention deletes completed or cancelled records beyond the Organization retention period,
 * then notifies administrators with a summary.
 *
 * The scheduled service supplies Organization-scoped persistence without a user session.
 */
import type { OnboardingRetentionStore } from './onboardingRetentionPorts.server';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import { retentionCutoff } from '$lib/utils/retentionCutoff';
import { DEFAULT_ARCHIVE_RETENTION_MONTHS } from '$features/organization/contracts';

interface OnboardingRetentionPorts {
	store: OnboardingRetentionStore;
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
}

const MIN_ONBOARDING_RETENTION_MONTHS = 1;

export interface OnboardingRetentionOrgConfig {
	id: string;
	retentionMonths?: number | null;
}

export interface OnboardingRetentionCleanupResult {
	deletedCount: number;
	orgsAffected: number;
}

const RETENTION_DELETE_CHUNK_SIZE = 100;

function chunksOf<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function normalizeRetentionMonths(retentionMonths: number | null | undefined): number {
	if (retentionMonths == null || !Number.isFinite(retentionMonths) || retentionMonths <= 0) {
		return DEFAULT_ARCHIVE_RETENTION_MONTHS;
	}
	return Math.max(MIN_ONBOARDING_RETENTION_MONTHS, retentionMonths);
}

export async function cleanupExpiredOnboardings(
	ports: OnboardingRetentionPorts,
	orgConfigs: OnboardingRetentionOrgConfig[]
): Promise<OnboardingRetentionCleanupResult> {
	if (orgConfigs.length === 0) {
		return { deletedCount: 0, orgsAffected: 0 };
	}
	const { store } = ports;

	const now = new Date();
	let totalDeleted = 0;
	const affectedOrgs = new Set<string>();

	for (const org of orgConfigs) {
		const cutoff = retentionCutoff(now, normalizeRetentionMonths(org.retentionMonths));
		const completed = await store.listExpired(org.id, 'completed', cutoff);
		const cancelled = await store.listExpired(org.id, 'cancelled', cutoff);

		let deletedCount = 0;
		for (const [status, rows] of [
			['completed', completed],
			['cancelled', cancelled]
		] as const) {
			for (const ids of chunksOf(
				rows.map((row) => row.id),
				RETENTION_DELETE_CHUNK_SIZE
			)) {
				deletedCount += await store.deleteExpiredBatch(org.id, status, ids, cutoff);
			}
		}
		if (deletedCount === 0) continue;

		affectedOrgs.add(org.id);
		totalDeleted += deletedCount;

		await ports.notifications.notifyAdmins(org.id, null, {
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
