import type { DataStore } from '$lib/server/core/ports';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

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

export async function cleanupExpiredOnboardings(store: DataStore, orgConfigs: OrgConfig[]): Promise<CleanupResult> {
	if (orgConfigs.length === 0) {
		return { deletedCount: 0, orgsAffected: 0 };
	}

	const now = new Date();
	let totalDeleted = 0;
	const affectedOrgs = new Set<string>();

	for (const org of orgConfigs) {
		const completed = await store.findMany<OnboardingRow>('personnel_onboardings', org.id, {
			status: 'completed'
		});
		const cancelled = await store.findMany<OnboardingRow>('personnel_onboardings', org.id, {
			status: 'cancelled'
		});

		const toDelete: OnboardingRow[] = [];

		for (const ob of [...completed, ...cancelled]) {
			const dateField = ob.status === 'completed' ? ob.completed_at : ob.cancelled_at;
			if (!dateField) continue;

			const expiresAt = new Date(dateField);
			expiresAt.setMonth(expiresAt.getMonth() + org.retentionMonths);

			if (now > expiresAt) {
				toDelete.push(ob);
			}
		}

		if (toDelete.length === 0) continue;

		affectedOrgs.add(org.id);

		for (const ob of toDelete) {
			// Cascade: delete step progress rows for this onboarding
			const steps = await store.findMany<{ id: string }>('onboarding_step_progress', org.id, {
				onboarding_id: ob.id
			});
			for (const step of steps) {
				await store.delete('onboarding_step_progress', org.id, step.id);
			}
			await store.delete('personnel_onboardings', org.id, ob.id);
		}

		totalDeleted += toDelete.length;

		await notifyAdminsViaStore(store, org.id, null, {
			type: 'onboarding_auto_deleted',
			title: 'Onboarding Records Auto-Deleted',
			message: `${toDelete.length} onboarding record${toDelete.length === 1 ? '' : 's'} auto-deleted after retention period`
		});
	}

	return {
		deletedCount: totalDeleted,
		orgsAffected: affectedOrgs.size
	};
}
