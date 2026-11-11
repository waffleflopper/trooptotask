import type { FeatureKey } from '$lib/access/featureSwitches';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import {
	readUnitCounts,
	type OrganizationOverviewCountsPort,
	type OrganizationUnitCountsPort
} from '$features/organization/index.server';
import {
	FEATURE_SETUP,
	featuresNotSetUp,
	setupFeaturesOn,
	type SettingsOverviewData
} from '$features/organization/contracts';

export interface SettingsOverviewPorts {
	disabledFeatures: readonly FeatureKey[];
	unitCounts: OrganizationUnitCountsPort;
	overviewCounts: OrganizationOverviewCountsPort;
}

async function readFeaturesNotSetUp({ disabledFeatures, unitCounts }: SettingsOverviewPorts) {
	const features = setupFeaturesOn(disabledFeatures);
	if (features.length === 0) return [];
	const counts = await readUnitCounts(
		unitCounts,
		features.map((feature) => FEATURE_SETUP[feature].count)
	);
	return featuresNotSetUp(disabledFeatures, counts);
}

export function loadSettingsOverview(ports: SettingsOverviewPorts): SettingsOverviewData {
	return {
		ungroupedPeople: keepStreamedRejectionObserved(ports.overviewCounts.countActiveUngroupedPeople()),
		membersCoveringNoGroups: keepStreamedRejectionObserved(ports.overviewCounts.countMembersCoveringNoGroups()),
		featuresNotSetUp: keepStreamedRejectionObserved(readFeaturesNotSetUp(ports))
	};
}
