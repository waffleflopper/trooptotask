import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { OrganizationUnitCountsPort } from '$features/organization/index.server';
import { loadFeaturesSettings } from './settingsFeatures.server';

const TABLE_COUNTS: Record<string, number> = {
	personnel: 22,
	status_types: 6,
	training_types: 8,
	personnel_trainings: 912,
	ict_tasks: 0,
	onboarding_templates: 3
};

describe('loadFeaturesSettings', () => {
	it('returns the stored switches, floor and window, and streams what each feature holds', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{ id: ctx.auth.orgId, strength_floor_percent: 65, loss_warning_window_days: 120 }
		]);
		let releaseCounts!: () => void;
		const held = new Promise<void>((resolve) => (releaseCounts = resolve));
		const unitCounts: OrganizationUnitCountsPort = {
			countRows: async (source) => (await held, TABLE_COUNTS[source.table]),
			countRatingSchemeEntries: async () => (await held, 21)
		};

		const data = await loadFeaturesSettings({
			auth: ctx.auth,
			disabledFeatures: ['criticalTasks'],
			organizationSettings: ctx.organizationSettings,
			unitCounts
		});

		expect(data).toMatchObject({
			disabledFeatures: ['criticalTasks'],
			strengthFloorPercent: 65,
			lossWarningWindowDays: 120
		});
		releaseCounts();
		expect(await data.counts).toEqual({
			activePersonnel: 22,
			statusTypes: 6,
			trainingTypes: 8,
			trainingRecords: 912,
			criticalTaskLists: 0,
			ratingSchemeEntries: 21,
			onboardingTemplates: 3
		});
	});
});
