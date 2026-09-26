import { personnelTrainingsStore } from './stores/personnelTrainings.svelte';
import { trainingRankCatalogStore } from './stores/rankCatalog.svelte';
import { trainingTypesStore } from './stores/trainingTypes.svelte';
import { trainingViewsStore } from './stores/trainingViews.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from './training.types';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { personnelRosterHydration } from '$features/personnel';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingWorkspaceHydration, TrainingWorkspaceHydrationTarget } from './server/trainingWorkspaceBootstrap';

export interface TrainingHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface TrainingHydrationStores {
	personnelStore: TrainingHydrationLoadable<Personnel>;
	groupsStore: TrainingHydrationLoadable<Group>;
	trainingTypesStore: TrainingHydrationLoadable<TrainingType>;
	trainingViewsStore: TrainingHydrationLoadable<TrainingView>;
	personnelTrainingsStore: TrainingHydrationLoadable<PersonnelTraining>;
	pinnedGroupsStore: TrainingHydrationLoadable<string>;
	rankCatalogStore: TrainingHydrationLoadable<RankCatalogEntry>;
}

export interface TrainingWorkspaceHydrator {
	hydrate(hydration?: TrainingWorkspaceHydration, stores?: TrainingHydrationStores): Promise<void>;
	reset(): void;
}

const defaultTrainingHydrationStores: TrainingHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore,
	trainingTypesStore,
	trainingViewsStore,
	personnelTrainingsStore,
	pinnedGroupsStore,
	rankCatalogStore: trainingRankCatalogStore
};

function createTargetDescriptor<T>(
	target: TrainingWorkspaceHydrationTarget<T>,
	store: TrainingHydrationLoadable<T>,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(items as T[], orgId)
	};
}

export function createTrainingWorkspaceHydrator(): TrainingWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'training-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		async hydrate(
			hydration?: TrainingWorkspaceHydration,
			stores: TrainingHydrationStores = defaultTrainingHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
				createTargetDescriptor(hydration.trainingViews, stores.trainingViewsStore, orgId, 'trainingViews'),
				createTargetDescriptor(
					hydration.personnelTrainings,
					stores.personnelTrainingsStore,
					orgId,
					'personnelTrainings'
				),
				createTargetDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups'),
				hydration.rankCatalog
					? createTargetDescriptor(hydration.rankCatalog, stores.rankCatalogStore, orgId, 'rankCatalog')
					: undefined
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const trainingWorkspaceHydrator = createTrainingWorkspaceHydrator();
