import { evaluationStore, ratingSchemeStore } from './stores/ratingScheme.svelte';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Evaluation, RatingScheme } from './rating-scheme.types';
import type { RatingSchemeWorkspaceHydration, RatingSchemeWorkspaceHydrationTarget } from './contracts';

export interface RatingSchemeHydrationLoadable<T> {
	readonly orgId: string;
	readonly loadVersion?: number;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface RatingSchemeHydrationStores {
	ratingSchemeStore: RatingSchemeHydrationLoadable<RatingScheme>;
	evaluationStore: RatingSchemeHydrationLoadable<Evaluation>;
}

export interface RatingSchemeWorkspaceHydrator {
	hydrate(hydration?: RatingSchemeWorkspaceHydration, stores?: RatingSchemeHydrationStores): Promise<void>;
	restrict(orgId: string, stores?: RatingSchemeHydrationStores): void;
	reset(): void;
}

const defaultRatingSchemeHydrationStores: RatingSchemeHydrationStores = {
	ratingSchemeStore,
	evaluationStore
};

function createTargetDescriptor<T>(
	target: RatingSchemeWorkspaceHydrationTarget<T>,
	store: RatingSchemeHydrationLoadable<T>,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(items as T[], orgId)
	};
}

export function createRatingSchemeWorkspaceHydrator(): RatingSchemeWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'rating-scheme-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		restrict(orgId: string, stores: RatingSchemeHydrationStores = defaultRatingSchemeHydrationStores) {
			hydrationTargets.reset();
			stores.ratingSchemeStore.load([], orgId);
			stores.evaluationStore.load([], orgId);
		},

		async hydrate(
			hydration?: RatingSchemeWorkspaceHydration,
			stores: RatingSchemeHydrationStores = defaultRatingSchemeHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.ratingSchemes, stores.ratingSchemeStore, orgId, 'ratingSchemes'),
				createTargetDescriptor(hydration.evaluations, stores.evaluationStore, orgId, 'evaluations')
			].filter((descriptor) => descriptor !== undefined);
			if (!descriptors.length) return;

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const ratingSchemeWorkspaceHydrator = createRatingSchemeWorkspaceHydrator();
