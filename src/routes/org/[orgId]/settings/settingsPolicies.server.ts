import type { FeatureKey } from '$lib/access/featureSwitches';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { loadRosterPersonnel } from '$features/personnel/index.server';
import { DEFAULT_TRAINING_BRIEFING_INPUT, type TrainingBriefingReportData } from '$features/training/contracts';
import {
	DEFAULT_ARCHIVE_RETENTION_MONTHS,
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	DEFAULT_TRAINING_READINESS_GOAL_PERCENT,
	type OrganizationSettingsReader
} from '$features/organization/contracts';
import type { GroupReadiness, PoliciesSettingsData } from './policiesSettings';

export interface PoliciesSettingsPorts {
	auth: { orgId: string };
	/** The admitted request already read the switches with the organization row. */
	disabledFeatures: readonly FeatureKey[];
	organizationSettings: Pick<OrganizationSettingsReader, 'findPolicies'>;
	roster: Parameters<typeof loadRosterPersonnel>[0]['roster'];
	readTrainingBriefing: (
		input: typeof DEFAULT_TRAINING_BRIEFING_INPUT,
		asOf: string
	) => Promise<TrainingBriefingReportData>;
}

/** The group rows Training Reports opens on, which its heat map grades against the goal. */
async function readGroupReadiness(ports: PoliciesSettingsPorts, asOf: string): Promise<GroupReadiness[]> {
	const report = await ports.readTrainingBriefing({ ...DEFAULT_TRAINING_BRIEFING_INPUT, rowsBy: 'group' }, asOf);
	return report.briefing.grid.rows.flatMap(({ label, today }) =>
		today.percent === null
			? []
			: [{ name: label, ready: today.ready, applicable: today.applicable, percent: today.percent }]
	);
}

export async function loadPoliciesSettings(
	ports: PoliciesSettingsPorts,
	input: { today: string }
): Promise<PoliciesSettingsData> {
	const lossesOn = !ports.disabledFeatures.includes('lossesAndAwards');
	const groupReadiness = ports.disabledFeatures.includes('training')
		? null
		: keepStreamedRejectionObserved(readGroupReadiness(ports, input.today));
	const [policies, active, archived] = await Promise.all([
		ports.organizationSettings.findPolicies(ports.auth.orgId),
		lossesOn ? loadRosterPersonnel(ports, { status: 'active' }) : null,
		loadRosterPersonnel(ports, { status: 'archived', order: 'archived-newest' })
	]);
	return {
		lossWarningWindowDays: policies?.lossWarningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		trainingReadinessGoalPercent: policies?.trainingReadinessGoalPercent ?? DEFAULT_TRAINING_READINESS_GOAL_PERCENT,
		archiveRetentionMonths: policies?.archiveRetentionMonths ?? DEFAULT_ARCHIVE_RETENTION_MONTHS,
		today: input.today,
		lossCandidates:
			active
				?.filter((person) => person.ets || person.deros)
				.map(({ id, rank, lastName, ets, deros, groupId }) => ({ id, rank, lastName, ets, deros, groupId })) ?? null,
		oldestArchivedAt: archived.at(-1)?.archivedAt ?? null,
		groupReadiness
	};
}
