import type { FeatureKey } from '$lib/access/featureSwitches';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { readUnitCounts, type OrganizationUnitCountsPort } from '$features/organization/index.server';
import {
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	DEFAULT_STRENGTH_FLOOR_PERCENT,
	FEATURE_COUNT_KEYS,
	type FeaturesSettingsData,
	type OrganizationSettingsReader
} from '$features/organization/contracts';

export interface FeaturesSettingsPorts {
	auth: { orgId: string };
	/** The admitted request already read the switches with the organization row. */
	disabledFeatures: readonly FeatureKey[];
	organizationSettings: Pick<OrganizationSettingsReader, 'findPolicies'>;
	unitCounts: OrganizationUnitCountsPort;
}

export async function loadFeaturesSettings(ports: FeaturesSettingsPorts): Promise<FeaturesSettingsData> {
	const counts = keepStreamedRejectionObserved(readUnitCounts(ports.unitCounts, FEATURE_COUNT_KEYS));
	const policies = await ports.organizationSettings.findPolicies(ports.auth.orgId);
	return {
		disabledFeatures: [...ports.disabledFeatures],
		strengthFloorPercent: policies?.strengthFloorPercent ?? DEFAULT_STRENGTH_FLOOR_PERCENT,
		lossWarningWindowDays: policies?.lossWarningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		counts
	};
}
