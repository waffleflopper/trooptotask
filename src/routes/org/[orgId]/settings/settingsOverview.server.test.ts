import { describe, expect, it } from 'vitest';
import type { OrganizationOverviewCountsPort, OrganizationUnitCountsPort } from '$features/organization/index.server';
import { loadSettingsOverview } from './settingsOverview.server';

const TABLE_COUNTS: Record<string, number> = { training_types: 0, ict_tasks: 0, onboarding_templates: 3 };

function unitCounts(ratingSchemeEntries: number): OrganizationUnitCountsPort & { reads: string[] } {
	const reads: string[] = [];
	return {
		reads,
		countRows: async (source) => (reads.push(source.table), TABLE_COUNTS[source.table]),
		countRatingSchemeEntries: async () => (reads.push('rating_scheme_entries'), ratingSchemeEntries)
	};
}

const overviewCounts: OrganizationOverviewCountsPort = {
	countActiveUngroupedPeople: async () => 4,
	countMembersCoveringNoGroups: async () => 2
};

describe('loadSettingsOverview', () => {
	it('streams each check as its own value', async () => {
		const overview = loadSettingsOverview({ disabledFeatures: [], unitCounts: unitCounts(21), overviewCounts });

		expect(await overview.ungroupedPeople).toBe(4);
		expect(await overview.membersCoveringNoGroups).toBe(2);
		expect(await overview.featuresNotSetUp).toEqual(['training', 'criticalTasks']);
	});

	it('leaves a disabled feature out and reads no count for it', async () => {
		const counts = unitCounts(0);

		const overview = loadSettingsOverview({
			disabledFeatures: ['training', 'criticalTasks', 'lossesAndAwards'],
			unitCounts: counts,
			overviewCounts
		});

		expect(await overview.featuresNotSetUp).toEqual(['evaluations']);
		expect(counts.reads.sort()).toEqual(['onboarding_templates', 'rating_scheme_entries']);
	});

	it('reads nothing for features when every checked feature is off', async () => {
		const counts = unitCounts(0);

		const overview = loadSettingsOverview({
			disabledFeatures: ['training', 'criticalTasks', 'evaluations', 'onboarding'],
			unitCounts: counts,
			overviewCounts
		});

		expect(await overview.featuresNotSetUp).toEqual([]);
		expect(counts.reads).toEqual([]);
	});

	it('starts every read before any settles, so the checks do not wait on one another', async () => {
		const started: string[] = [];
		const never = new Promise<number>(() => {});

		loadSettingsOverview({
			disabledFeatures: [],
			unitCounts: {
				countRows: () => (started.push('rows'), never),
				countRatingSchemeEntries: () => (started.push('rating'), never)
			},
			overviewCounts: {
				countActiveUngroupedPeople: () => (started.push('ungrouped'), never),
				countMembersCoveringNoGroups: () => (started.push('scopes'), never)
			}
		});
		await Promise.resolve();

		expect(started.sort()).toEqual(['ungrouped', 'scopes', 'rows', 'rows', 'rows', 'rating'].sort());
	});

	it('leaves the other checks resolving when one read rejects', async () => {
		const overview = loadSettingsOverview({
			disabledFeatures: [],
			unitCounts: unitCounts(21),
			overviewCounts: {
				countActiveUngroupedPeople: async () => {
					throw new Error('Count unavailable');
				},
				countMembersCoveringNoGroups: async () => 2
			}
		});

		await expect(overview.ungroupedPeople).rejects.toThrow('Count unavailable');
		expect(await overview.membersCoveringNoGroups).toBe(2);
		expect(await overview.featuresNotSetUp).toEqual(['training', 'criticalTasks']);
	});
});
