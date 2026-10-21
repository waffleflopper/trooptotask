import { describe, expect, it, vi } from 'vitest';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingBriefingReportData } from '$features/training/contracts';
import { loadPoliciesSettings, type PoliciesSettingsPorts } from './settingsPolicies.server';

function person(id: string, dates: Partial<Personnel>): Personnel {
	return {
		id,
		rank: 'SPC',
		lastName: id,
		firstName: 'A',
		mos: '68W',
		clinicRole: '',
		groupId: 'g1',
		groupName: '1st PLT',
		...dates
	};
}

const ACTIVE = [person('reed', { deros: '2027-03-02' }), person('hale', {}), person('kim', { ets: '2026-11-20' })];
const ARCHIVED = [
	person('vance', { archivedAt: '2025-06-01T10:00:00.000Z' }),
	person('lane', { archivedAt: '2024-11-02T03:00:00.000Z' })
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
	const list = vi.fn(async (options?: { status?: string }) => (options?.status === 'archived' ? ARCHIVED : ACTIVE));
	const readTrainingBriefing = vi.fn(async () => REPORT);
	const value: PoliciesSettingsPorts = {
		auth: { orgId: 'org-1' },
		disabledFeatures,
		organizationSettings: { findPolicies: async () => stored },
		roster: { list },
		readTrainingBriefing
	};
	return { value, list, readTrainingBriefing };
}

describe('loadPoliciesSettings', () => {
	it('returns the saved policies, the people with loss dates, the oldest archive and the streamed group readiness', async () => {
		const { value, readTrainingBriefing } = ports([], {
			lossWarningWindowDays: 120,
			trainingReadinessGoalPercent: 85,
			archiveRetentionMonths: 24,
			strengthFloorPercent: 80
		});

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect({ ...data, groupReadiness: undefined }).toEqual({
			lossWarningWindowDays: 120,
			trainingReadinessGoalPercent: 85,
			archiveRetentionMonths: 24,
			today: '2026-10-21',
			lossCandidates: [
				{ id: 'reed', rank: 'SPC', lastName: 'reed', ets: undefined, deros: '2027-03-02', groupId: 'g1' },
				{ id: 'kim', rank: 'SPC', lastName: 'kim', ets: '2026-11-20', deros: undefined, groupId: 'g1' }
			],
			oldestArchivedAt: '2024-11-02T03:00:00.000Z',
			groupReadiness: undefined
		});
		expect(await data.groupReadiness).toEqual([
			{ name: '2nd PLT', ready: 81, applicable: 100, percent: 81 },
			{ name: 'Maint PLT', ready: 39, applicable: 50, percent: 78 }
		]);
		expect(readTrainingBriefing).toHaveBeenCalledWith(
			expect.objectContaining({ rowsBy: 'group', groupId: null }),
			'2026-10-21'
		);
	});

	it('takes the defaults for missing settings and has no archive date when no one is archived', async () => {
		const { value, list } = ports([], null);
		list.mockImplementation(async (options) => (options?.status === 'archived' ? [] : ACTIVE));

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect([data.lossWarningWindowDays, data.trainingReadinessGoalPercent, data.archiveRetentionMonths]).toEqual([
			180, 90, 36
		]);
		expect(data.oldestArchivedAt).toBeNull();
	});

	it('skips the loss dates and the training briefing for features that are off', async () => {
		const { value, list, readTrainingBriefing } = ports(['lossesAndAwards', 'training'], null);

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect(data.lossCandidates).toBeNull();
		expect(data.groupReadiness).toBeNull();
		expect(readTrainingBriefing).not.toHaveBeenCalled();
		expect(list.mock.calls.map(([options]) => options?.status)).toEqual(['archived']);
	});

	it('renders the page while the briefing read fails, which only its sentence reports', async () => {
		const { value, readTrainingBriefing } = ports([], null);
		readTrainingBriefing.mockRejectedValue(new Error('briefing down'));

		const data = await loadPoliciesSettings(value, { today: '2026-10-21' });

		expect(data.lossWarningWindowDays).toBe(180);
		await expect(data.groupReadiness).rejects.toThrow('briefing down');
	});
});
