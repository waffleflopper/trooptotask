// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './createStore.svelte';
import { createMockAdapter } from './ports';
import { CONFIRMED_CHANGE_RETENTION_MS, confirmedBeforeRequest, SnapshotTooOldError } from './confirmedChanges';
import { confirmedChangesSentNow } from '$lib/test-support/confirmedChangeCookies';

interface Row {
	id: string;
	name: string;
}

function rowStore(create = createStore<Row>) {
	return create({
		resource: 'rows',
		adapter: createMockAdapter<Row>({
			create: async (data) => ({ id: `row-${crypto.randomUUID()}`, ...data }),
			remove: async () => 'deleted'
		})
	});
}

const everything = () => true;

describe('confirmed changes', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("re-applies this tab's change even after another tab confirmed more", async () => {
		const store = rowStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		vi.resetModules();
		const otherTab = await import('./createStore.svelte');
		const other = rowStore(otherTab.createStore<Row>);
		other.load([], 'org-1');
		for (let i = 0; i < 5; i++) await other.add({ name: `Other ${i}` });

		const request = confirmedChangesSentNow();
		await store.remove('a');
		const read = store.beginRead(confirmedBeforeRequest(request));

		expect(read.reconcile([{ id: 'a', name: 'A' }], everything)).toEqual([]);
	});

	it('throws for a snapshot whose request left before the changes it needs were discarded', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z') });
		const store = rowStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		const request = confirmedChangesSentNow();
		await store.remove('a');
		vi.advanceTimersByTime(CONFIRMED_CHANGE_RETENTION_MS + 1);
		await store.add({ name: 'Later' });

		const read = store.beginRead(confirmedBeforeRequest(request));

		expect(() => read.reconcile([{ id: 'a', name: 'A' }], everything)).toThrow(SnapshotTooOldError);
	});

	it('ignores a snapshot whose request left before a full read began, with no change between', () => {
		const store = rowStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		const older = confirmedChangesSentNow();
		const full = store.beginAdoption();
		const later = confirmedChangesSentNow();
		store.load(full.adopt([{ id: 'b', name: 'B' }]), 'org-1');
		full.close();

		expect(store.beginRead(confirmedBeforeRequest(older)).reconcile([{ id: 'a', name: 'A' }], everything)).toEqual([
			{ id: 'b', name: 'B' }
		]);
		expect(store.beginRead(confirmedBeforeRequest(later)).reconcile([{ id: 'c', name: 'C' }], everything)).toEqual([
			{ id: 'c', name: 'C' }
		]);
	});

	it('re-applies every retained change for a request that carried no token', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z') });
		const store = rowStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		await store.remove('a');
		vi.advanceTimersByTime(CONFIRMED_CHANGE_RETENTION_MS + 1);
		await store.add({ name: 'Later' });

		const recentRead = store.beginRead(confirmedBeforeRequest({}));

		expect(recentRead.reconcile([], everything)).toEqual(store.rawItems);
	});
});
