import { onboardingStore } from './stores/onboarding.svelte';
import { onboardingTemplateStore } from './stores/onboardingTemplate.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { TrainingType } from '$features/training/training.types';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Group } from '$features/personnel/contracts';
import { personnelRosterHydration } from '$features/personnel';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Personnel } from '$lib/types';
import type {
	OnboardingTemplatesWorkspaceHydrationTarget,
	OnboardingWorkspaceHydration,
	OnboardingWorkspaceHydrationTarget
} from './server/onboardingWorkspaceBootstrap';

export interface OnboardingHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface OnboardingTemplatesHydrationLoadable {
	readonly orgId: string;
	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string): void;
}

export interface OnboardingHydrationStores {
	personnelStore: OnboardingHydrationLoadable<Personnel>;
	groupsStore: OnboardingHydrationLoadable<Group>;
	trainingTypesStore: OnboardingHydrationLoadable<TrainingType>;
	onboardingTemplateStore: OnboardingTemplatesHydrationLoadable;
	onboardingStore: OnboardingHydrationLoadable<PersonnelOnboarding>;
}

export interface OnboardingWorkspaceHydrator {
	hydrate(hydration?: OnboardingWorkspaceHydration, stores?: OnboardingHydrationStores): Promise<void>;
	reset(): void;
}

type OnboardingTemplatesResolved = Pick<OnboardingTemplatesWorkspaceHydrationTarget, 'templates' | 'steps'>;

const defaultOnboardingHydrationStores: OnboardingHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore,
	trainingTypesStore,
	onboardingTemplateStore,
	onboardingStore
};

function createTargetDescriptor<T>(
	target: OnboardingWorkspaceHydrationTarget<T>,
	store: OnboardingHydrationLoadable<T>,
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

function createTemplatesTargetDescriptor(
	target: OnboardingTemplatesWorkspaceHydrationTarget,
	store: OnboardingTemplatesHydrationLoadable,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: { templates: target.templates, steps: target.steps },
		storeOrgId: () => store.orgId,
		apply: (items) => {
			const { templates, steps } = items as OnboardingTemplatesResolved;
			store.load(templates, steps, orgId);
		}
	};
}

export function createOnboardingWorkspaceHydrator(): OnboardingWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'onboarding-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		async hydrate(
			hydration?: OnboardingWorkspaceHydration,
			stores: OnboardingHydrationStores = defaultOnboardingHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
				createTemplatesTargetDescriptor(
					hydration.onboardingTemplates,
					stores.onboardingTemplateStore,
					orgId,
					'onboardingTemplates'
				),
				createTargetDescriptor(hydration.onboardings, stores.onboardingStore, orgId, 'onboardings')
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const onboardingWorkspaceHydrator = createOnboardingWorkspaceHydrator();
