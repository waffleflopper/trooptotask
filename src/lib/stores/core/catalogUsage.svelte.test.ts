import { describe, expect, it } from 'vitest';
import { CatalogUsageView } from './catalogUsage.svelte';
import type { CatalogUsage } from './catalogArchive';

function held() {
	let resolve!: (counts: CatalogUsage) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<CatalogUsage>((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('CatalogUsageView', () => {
	it('knows no count until a load finishes', async () => {
		const call = held();
		const view = new CatalogUsageView(
			() => 'org-1',
			() => call.promise
		);

		expect([view.status, view.countFor('a')]).toEqual(['idle', null]);
		const loading = view.load();
		expect([view.status, view.countFor('a')]).toEqual(['loading', null]);
		call.resolve({ a: 4, b: 0 });
		await loading;

		expect([view.status, view.countFor('a'), view.countFor('b')]).toEqual(['ready', 4, 0]);
	});

	it('counts a type the server did not list as zero once loaded', async () => {
		const view = new CatalogUsageView(
			() => 'org-1',
			async () => ({})
		);

		await view.load();

		expect(view.countFor('new-type')).toBe(0);
	});

	it('reports an error and keeps every count unknown', async () => {
		const view = new CatalogUsageView(
			() => 'org-1',
			async () => {
				throw new Error('offline');
			}
		);

		await view.load();

		expect([view.status, view.countFor('a')]).toEqual(['error', null]);
	});

	it('recovers when a retry succeeds', async () => {
		let fail = true;
		const view = new CatalogUsageView(
			() => 'org-1',
			async () => {
				if (fail) throw new Error('offline');
				return { a: 1 };
			}
		);
		await view.load();
		fail = false;

		await view.load();

		expect([view.status, view.countFor('a')]).toEqual(['ready', 1]);
	});

	it('drops an older load that finishes after a newer one', async () => {
		const first = held();
		const second = held();
		const calls = [first, second];
		const view = new CatalogUsageView(
			() => 'org-1',
			() => calls.shift()!.promise
		);

		const older = view.load();
		const newer = view.load();
		second.resolve({ a: 2 });
		await newer;
		first.resolve({ a: 99 });
		await older;

		expect(view.countFor('a')).toBe(2);
	});

	it('drops a load that finishes after the Organization changed, and shows no counts for the new one', async () => {
		let orgId = 'org-1';
		const call = held();
		const view = new CatalogUsageView(
			() => orgId,
			() => call.promise
		);
		const loading = view.load();
		orgId = 'org-2';
		call.resolve({ a: 5 });
		await loading;

		expect([view.status, view.countFor('a')]).toEqual(['loading', null]);
	});

	it('stops reporting counts loaded for another Organization', async () => {
		let orgId = 'org-1';
		const view = new CatalogUsageView(
			() => orgId,
			async () => ({ a: 5 })
		);
		await view.load();

		orgId = 'org-2';

		expect(view.countFor('a')).toBeNull();
	});
});
