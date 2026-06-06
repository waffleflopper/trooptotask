import { describe, expect, it } from 'vitest';
import type { RatingSchemeEntry } from './rating-scheme.types';
import type { RatingSchemeWorkspaceHydration } from './server/ratingSchemeWorkspaceBootstrap';
import {
	createRatingSchemeWorkspaceHydrator,
	type RatingSchemeHydrationStores
} from './ratingSchemeWorkspaceHydration.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createLoadable<T>() {
	let orgId = '';
	let items: T[] = [];
	let loading = false;
	return {
		get orgId() {
			return orgId;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		loadCount: 0,
		load(nextItems: T[], nextOrgId: string) {
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
			this.loadCount += 1;
		},
		startLoading() {
			loading = true;
		}
	};
}

function createStores() {
	return {
		ratingSchemeStore: createLoadable<RatingSchemeEntry>()
	} satisfies RatingSchemeHydrationStores;
}

function entry(id: string): RatingSchemeEntry {
	return {
		id,
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2024-01-01',
		ratingPeriodEnd: '2024-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	};
}

describe('Rating Scheme workspace hydration adapter', () => {
	it('hydrates explicit Rating Scheme workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const ratingEntry = entry('rs1');
		const hydration: RatingSchemeWorkspaceHydration = {
			orgId: 'org-1',
			ratingSchemeEntries: { mode: 'replace', snapshotKey: 'entries:1', items: [ratingEntry] }
		};

		await createRatingSchemeWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.ratingSchemeStore.items).toEqual([ratingEntry]);
		expect(stores.ratingSchemeStore.orgId).toBe('org-1');
	});

	it('ignores stale deferred Rating Scheme entries when a newer org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createRatingSchemeWorkspaceHydrator();
		const staleEntries = deferred<RatingSchemeEntry[]>();
		const freshEntry = entry('fresh');

		const staleHydration: RatingSchemeWorkspaceHydration = {
			orgId: 'org-old',
			ratingSchemeEntries: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'old-entries',
				items: staleEntries.promise
			}
		};
		const freshHydration: RatingSchemeWorkspaceHydration = {
			orgId: 'org-new',
			ratingSchemeEntries: { mode: 'replace', snapshotKey: 'new-entries', items: [freshEntry] }
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		await hydrator.hydrate(freshHydration, stores);
		staleEntries.resolve([entry('stale')]);
		await stalePending;

		expect(stores.ratingSchemeStore.orgId).toBe('org-new');
		expect(stores.ratingSchemeStore.items).toEqual([freshEntry]);
	});
});
