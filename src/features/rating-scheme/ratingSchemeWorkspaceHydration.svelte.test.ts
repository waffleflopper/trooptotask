import { describe, expect, it } from 'vitest';
import type { RatingSchemeEntry } from './rating-scheme.types';
import type { RatingSchemeWorkspaceHydration } from './server/ratingSchemeWorkspaceBootstrap';
import {
	createRatingSchemeWorkspaceHydrator,
	type RatingSchemeHydrationStores
} from './ratingSchemeWorkspaceHydration.svelte';

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

	it('clears previous rows and ignores a pending allowed response after access is restricted', async () => {
		const stores = createStores();
		stores.ratingSchemeStore.load([entry('previous')], 'org-1');
		let resolve!: (rows: RatingSchemeEntry[]) => void;
		const items = new Promise<RatingSchemeEntry[]>((done) => {
			resolve = done;
		});
		const hydrator = createRatingSchemeWorkspaceHydrator();
		const pending = hydrator.hydrate(
			{
				orgId: 'org-1',
				ratingSchemeEntries: { mode: 'replace', snapshotKey: 'pending', items }
			},
			stores
		);
		expect(stores.ratingSchemeStore.loading).toBe(true);
		hydrator.restrict('org-1', stores);
		expect(stores.ratingSchemeStore.items).toEqual([]);
		expect(stores.ratingSchemeStore.loading).toBe(false);
		resolve([entry('late')]);
		await pending;
		expect(stores.ratingSchemeStore.items).toEqual([]);
		await hydrator.hydrate(
			{
				orgId: 'org-1',
				ratingSchemeEntries: { mode: 'replace', snapshotKey: 'fresh', items: [entry('restored')] }
			},
			stores
		);
		expect(stores.ratingSchemeStore.items.map((row) => row.id)).toEqual(['restored']);
	});
});
