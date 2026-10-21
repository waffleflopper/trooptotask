import { describe, expect, it, vi } from 'vitest';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { LossCandidate } from '$features/personnel/contracts';
import type { TrainingBriefingReportData } from '$features/training/contracts';
import { loadPoliciesSettings, type PoliciesSettingsPorts } from './settingsPolicies.server';

const PEOPLE: LossCandidate[] = [
	{ id: 'reed', rank: 'SPC', lastName: 'Reed', ets: null, deros: '2027-03-02', groupId: 'g1' },
	{ id: 'kim', rank: 'SPC', lastName: 'Kim', ets: '2026-11-20', deros: null, groupId: 'g1' }
];

function readiness(ready: number, applicable: number, percent: number | null) {
	return { ready, applicable, percent, band: 'goal' };
}

const REPORT = {
	briefing: {
		grid: {
			rows: [
				{ label: '2nd PLT', today: readiness(81, 100, 81) },
				{ label: 'Unassigned', today: readiness(0, 0, null) },
				{ label: 'Maint PLT', today: readiness(39, 50, 78) }
			]
		}
	}
} as unknown as TrainingBriefingReportData;

function ports(
	disabledFeatures: FeatureKey[],
	stored: Awaited<ReturnType<PoliciesSettingsPorts['organizationSettings']['findPolicies']>>
) {
	const listLossCandidates = vi.fn(async () => PEOPLE);
	const findOldestArchivedAt = vi.fn(async (): Promise<string | null> => '2024-11-02T03:00:00.000Z');
	const readTrainingBriefing = vi.fn(async () => REPORT);
	const value: PoliciesSettingsPorts = {
		auth: { orgId: 'org-1' },
		disabledFeatures,
		organizationSettings: { findPolicies: async () => stored },
		roster: { listLossCandidates, findOldestArchivedAt },
		readTrainingBriefing
	};
	return { value, listLossCandidates, findOldestArchivedAt, readTrainingBriefing };
}

describe('loadPoliciesSettings', () => {
	it('returns the saved policies and the oldest archive, and streams the loss dates and group readiness', async () => {
		const { value, readTrainingBriefing } = ports([], {
			lossWarningWindowDays: 120,
			trainingReadinessGoalPercent: 85,
			archiveRetentionMonths: 24,
			strengthFloorPercent: 80
		});

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect({ ...data, lossCandidates: undefined, groupReadiness: undefined }).toEqual({
			lossWarningWindowDays: 120,
			trainingReadinessGoalPercent: 85,
			archiveRetentionMonths: 24,
			today: '2026-10-21',
			lossCandidates: undefined,
			oldestArchivedAt: '2024-11-02T03:00:00.000Z',
			groupReadiness: undefined
		});
		expect(await data.lossCandidates).toEqual([
			{ id: 'reed', rank: 'SPC', lastName: 'Reed', ets: null, deros: '2027-03-02', groupId: 'g1' },
			{ id: 'kim', rank: 'SPC', lastName: 'Kim', ets: '2026-11-20', deros: null, groupId: 'g1' }
		]);
		expect(await data.groupReadiness).toEqual([
			{ name: '2nd PLT', ready: 81, applicable: 100, percent: 81 },
			{ name: 'Maint PLT', ready: 39, applicable: 50, percent: 78 }
		]);
		expect(readTrainingBriefing).toHaveBeenCalledWith(
			expect.objectContaining({ rowsBy: 'group', groupId: null }),
			'2026-10-21'
		);
	});

	it('takes the defaults for missing settings', async () => {
		const { value } = ports([], null);

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect([data.lossWarningWindowDays, data.trainingReadinessGoalPercent, data.archiveRetentionMonths]).toEqual([
			180, 90, 36
		]);
	});

	it('skips the loss dates and the training briefing for features that are off', async () => {
		const { value, listLossCandidates, readTrainingBriefing } = ports(['lossesAndAwards', 'training'], null);

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect(data.lossCandidates).toBeNull();
		expect(data.groupReadiness).toBeNull();
		expect(readTrainingBriefing).not.toHaveBeenCalled();
		expect(listLossCandidates).not.toHaveBeenCalled();
	});

	it('returns the saved settings while the loss dates and briefing reads fail, which only their sentences report', async () => {
		const { value, listLossCandidates, readTrainingBriefing } = ports([], null);
		listLossCandidates.mockRejectedValue(new Error('roster down'));
		readTrainingBriefing.mockRejectedValue(new Error('briefing down'));

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect(data.lossWarningWindowDays).toBe(180);
		await expect(data.lossCandidates).rejects.toThrow('roster down');
		await expect(data.groupReadiness).rejects.toThrow('briefing down');
	});

	it('returns the saved settings before the loss dates arrive', async () => {
		const { value, listLossCandidates } = ports([], null);
		listLossCandidates.mockReturnValue(new Promise(() => {}));

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect(data.archiveRetentionMonths).toBe(36);
	});
});
