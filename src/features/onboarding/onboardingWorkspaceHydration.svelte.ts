import { SvelteMap } from 'svelte/reactivity';
import { onboardingStore } from './stores/onboarding.svelte';
import { onboardingTemplateStore } from './stores/onboardingTemplate.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { TrainingType } from '$features/training/training.types';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
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

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface OnboardingHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

type OnboardingTemplatesResolved = Pick<OnboardingTemplatesWorkspaceHydrationTarget, 'templates' | 'steps'>;

const defaultOnboardingHydrationStores: OnboardingHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	trainingTypesStore,
	onboardingTemplateStore,
	onboardingStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function storeMovedToAnotherOrg(
	descriptor: OnboardingHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

function createTargetDescriptor<T>(
	target: OnboardingWorkspaceHydrationTarget<T>,
	store: OnboardingHydrationLoadable<T>,
	orgId: string,
	targetName: string
): OnboardingHydrationTargetDescriptor | undefined {
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
): OnboardingHydrationTargetDescriptor | undefined {
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
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: OnboardingHydrationTargetDescriptor, orgId: string): Promise<void> {
		const { targetName, snapshotKey } = descriptor;

		const appliedState = appliedSnapshotKeys.get(targetName);
		if (
			descriptor.storeOrgId() === orgId &&
			appliedState?.orgId === orgId &&
			appliedState.snapshotKey === snapshotKey
		) {
			return;
		}

		const pendingState = pendingSnapshotKeys.get(targetName);
		if (pendingState?.orgId === orgId && pendingState.snapshotKey === snapshotKey) return;

		pendingSnapshotKeys.set(targetName, { orgId, snapshotKey });

		if (isPromiseLike<unknown>(descriptor.items)) {
			const initialStoreOrgId = descriptor.storeOrgId();
			descriptor.startLoading?.();
			try {
				const items = await descriptor.items;
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) return;
				if (storeMovedToAnotherOrg(descriptor, orgId, initialStoreOrgId)) {
					pendingSnapshotKeys.delete(targetName);
					return;
				}
				descriptor.apply(items);
				pendingSnapshotKeys.delete(targetName);
				appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId === orgId && latestPending.snapshotKey === snapshotKey) {
					pendingSnapshotKeys.delete(targetName);
				}
				console.error(`[onboarding-hydration] Failed to load ${targetName} for org ${orgId}`, error);
				throw error;
			}
		}

		descriptor.apply(descriptor.items);
		pendingSnapshotKeys.delete(targetName);
		appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
	}

	return {
		reset() {
			appliedSnapshotKeys.clear();
			pendingSnapshotKeys.clear();
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
			].filter((descriptor): descriptor is OnboardingHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const onboardingWorkspaceHydrator = createOnboardingWorkspaceHydrator();
