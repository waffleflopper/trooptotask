// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './createStore.svelte';
import { createMockAdapter } from './ports';
import { CONFIRMED_CHANGE_COOKIE, CONFIRMED_CHANGE_RETENTION_MS, confirmedSequence } from './confirmedChanges';

interface Row {
	id: string;
	name: string;
}

function makeStore() {
	return createStore<Row>({
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

	it('sends the latest confirmed change with every later request', async () => {
		const store = makeStore();
		store.load([], 'org-1');

		await store.add({ name: 'Saved' });

		expect(document.cookie).toContain(`${CONFIRMED_CHANGE_COOKIE}=${confirmedSequence()}`);
	});

	it('changes nothing for a snapshot whose request left before the changes it needs were pruned', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-14T12:00:00Z') });
		const store = makeStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		const requestLeft = confirmedSequence();
		await store.remove('a');
		vi.advanceTimersByTime(CONFIRMED_CHANGE_RETENTION_MS + 1);
		await store.add({ name: 'Later' });

		const read = store.beginRead(requestLeft);

		expect(read.reconcile([{ id: 'a', name: 'A' }], everything)).toEqual(store.rawItems);
	});

	it('changes nothing for a snapshot whose request left before a full read was adopted', async () => {
		const store = makeStore();
		store.load([{ id: 'a', name: 'A' }], 'org-1');
		const older = store.beginRead();
		await store.add({ name: 'Saved' });
		const full = store.beginRead();
		store.load(full.adopt([{ id: 'b', name: 'B' }]), 'org-1');

		expect(older.reconcile([{ id: 'a', name: 'A' }], everything)).toEqual(store.rawItems);
	});
});
