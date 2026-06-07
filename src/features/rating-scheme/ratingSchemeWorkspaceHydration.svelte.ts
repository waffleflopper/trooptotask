import { ratingSchemeStore } from './stores/ratingScheme.svelte';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { RatingSchemeEntry } from './rating-scheme.types';
import type {
	RatingSchemeWorkspaceHydration,
	RatingSchemeWorkspaceHydrationTarget
} from './server/ratingSchemeWorkspaceBootstrap';

export interface RatingSchemeHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface RatingSchemeHydrationStores {
	ratingSchemeStore: RatingSchemeHydrationLoadable<RatingSchemeEntry>;
}

export interface RatingSchemeWorkspaceHydrator {
	hydrate(hydration?: RatingSchemeWorkspaceHydration, stores?: RatingSchemeHydrationStores): Promise<void>;
	reset(): void;
}

const defaultRatingSchemeHydrationStores: RatingSchemeHydrationStores = {
	ratingSchemeStore
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

		async hydrate(
			hydration?: RatingSchemeWorkspaceHydration,
			stores: RatingSchemeHydrationStores = defaultRatingSchemeHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptor = createTargetDescriptor(
				hydration.ratingSchemeEntries,
				stores.ratingSchemeStore,
				orgId,
				'ratingSchemeEntries'
			);
			if (!descriptor) return;

			await hydrationTargets.applyDescriptors(orgId, [descriptor]);
		}
	};
}

export const ratingSchemeWorkspaceHydrator = createRatingSchemeWorkspaceHydrator();
