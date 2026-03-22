import { describe, it, expect } from 'vitest';
import { createMutationLog } from './mutationLog.svelte';
import type { MutationEntry } from './replay';

interface TestItem {
	id: string;
	name: string;
}

describe('createMutationLog', () => {
	it('should start with zero pending entries', () => {
		const log = createMutationLog<TestItem>();

		expect(log.pending).toBe(0);
		expect(log.entries).toEqual([]);
	});

	it('should add entry and increment pending on push', () => {
		const log = createMutationLog<TestItem>();
		const entry: MutationEntry<TestItem> = {
			type: 'add',
			mutationId: 'm1',
			tempId: 'temp-1',
			data: { name: 'Alice' }
		};

		log.push(entry);

		expect(log.pending).toBe(1);
		expect(log.entries).toEqual([entry]);
	});

	it('should remove entry by mutationId on resolve', () => {
		const log = createMutationLog<TestItem>();
		log.push({ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Alice' } });
		log.push({ type: 'update', mutationId: 'm2', targetId: '1', data: { name: 'Bob' } });

		log.resolve('m1');

		expect(log.pending).toBe(1);
		expect(log.entries[0].mutationId).toBe('m2');
	});

	it('should be a no-op when resolving non-existent mutationId', () => {
		const log = createMutationLog<TestItem>();
		log.push({ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Alice' } });

		log.resolve('non-existent');

		expect(log.pending).toBe(1);
	});

	it('should remove all entries on clear', () => {
		const log = createMutationLog<TestItem>();
		log.push({ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Alice' } });
		log.push({ type: 'add', mutationId: 'm2', tempId: 'temp-2', data: { name: 'Bob' } });

		log.clear();

		expect(log.pending).toBe(0);
		expect(log.entries).toEqual([]);
	});
});
