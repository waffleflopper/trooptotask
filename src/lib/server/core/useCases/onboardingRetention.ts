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
import { notifyAdminsViaStore, retentionCutoff } from './retentionSupport';

interface OnboardingRow {
	id: string;
	organization_id: string;
	status: string;
	completed_at: string | null;
	cancelled_at: string | null;
}

const DEFAULT_ONBOARDING_RETENTION_MONTHS = 36;
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
		return DEFAULT_ONBOARDING_RETENTION_MONTHS;
	}
	return Math.max(MIN_ONBOARDING_RETENTION_MONTHS, retentionMonths);
}

export async function cleanupExpiredOnboardings(
	store: DataStore,
	orgConfigs: OnboardingRetentionOrgConfig[]
): Promise<OnboardingRetentionCleanupResult> {
	if (orgConfigs.length === 0) {
		return { deletedCount: 0, orgsAffected: 0 };
	}

	const now = new Date();
	let totalDeleted = 0;
	const affectedOrgs = new Set<string>();

	for (const org of orgConfigs) {
		const cutoff = retentionCutoff(now, normalizeRetentionMonths(org.retentionMonths));
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
