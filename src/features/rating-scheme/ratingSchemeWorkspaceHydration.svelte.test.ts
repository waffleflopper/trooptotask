import { describe, expect, it } from 'vitest';
import type { Evaluation, RatingScheme } from './rating-scheme.types';
import { ratingSchemeEntryFixture, splitRatingSchemeEntries } from './ratingSchemeStore.test-support.svelte';
import type { RatingSchemeWorkspaceHydration } from './contracts';
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
		ratingSchemeStore: createLoadable<RatingScheme>(),
		evaluationStore: createLoadable<Evaluation>()
	} satisfies RatingSchemeHydrationStores;
}

const { ratingSchemes, evaluations } = splitRatingSchemeEntries([ratingSchemeEntryFixture({ id: 'rs1' })]);

describe('Rating Scheme workspace hydration adapter', () => {
	it('hydrates the schemes and Evaluations through the adapter interface', async () => {
		const stores = createStores();
		const hydration: RatingSchemeWorkspaceHydration = {
			orgId: 'org-1',
			ratingSchemes: { mode: 'replace', snapshotKey: 'schemes:1', items: ratingSchemes },
			evaluations: { mode: 'replace', snapshotKey: 'evaluations:1', items: evaluations }
		};

		await createRatingSchemeWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.ratingSchemeStore.items).toEqual(ratingSchemes);
		expect(stores.evaluationStore.items).toEqual(evaluations);
		expect([stores.ratingSchemeStore.orgId, stores.evaluationStore.orgId]).toEqual(['org-1', 'org-1']);
	});

	it('clears both stores and ignores a pending allowed response after access is restricted', async () => {
		const stores = createStores();
		stores.ratingSchemeStore.load(ratingSchemes, 'org-1');
		stores.evaluationStore.load(evaluations, 'org-1');
		let resolve!: (rows: Evaluation[]) => void;
		const items = new Promise<Evaluation[]>((done) => {
			resolve = done;
		});
		const hydrator = createRatingSchemeWorkspaceHydrator();
		const pending = hydrator.hydrate(
			{
				orgId: 'org-1',
				ratingSchemes: { mode: 'replace', snapshotKey: 'pending', items: ratingSchemes },
				evaluations: { mode: 'replace', snapshotKey: 'pending', items }
			},
			stores
		);
		expect(stores.evaluationStore.loading).toBe(true);
		hydrator.restrict('org-1', stores);
		expect(stores.ratingSchemeStore.items).toEqual([]);
		expect(stores.evaluationStore.items).toEqual([]);
		expect(stores.evaluationStore.loading).toBe(false);
		resolve(evaluations);
		await pending;
		expect(stores.evaluationStore.items).toEqual([]);
		await hydrator.hydrate(
			{
				orgId: 'org-1',
				ratingSchemes: { mode: 'replace', snapshotKey: 'fresh', items: ratingSchemes },
				evaluations: { mode: 'replace', snapshotKey: 'fresh', items: evaluations }
			},
			stores
		);
		expect(stores.evaluationStore.items.map((row) => row.id)).toEqual(['rs1']);
	});
});
