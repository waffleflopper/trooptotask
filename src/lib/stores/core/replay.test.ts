import { describe, it, expect } from 'vitest';
import { replay } from './replay';
import type { MutationEntry } from './replay';

interface TestItem {
	id: string;
	name: string;
}

describe('replay', () => {
	it('should append item with tempId for add entry', () => {
		const server: TestItem[] = [{ id: '1', name: 'Alice' }];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Charlie' } }
		];

		const result = replay(server, entries);

		expect(result).toEqual([
			{ id: '1', name: 'Alice' },
			{ id: 'temp-1', name: 'Charlie' }
		]);
	});

	it('should patch matching item for update entry', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' }
		];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'update', mutationId: 'm1', targetId: '2', data: { name: 'Bobby' } }
		];

		const result = replay(server, entries);

		expect(result).toEqual([
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bobby' }
		]);
	});

	it('should filter out matching item for remove entry', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' }
		];
		const entries: MutationEntry<TestItem>[] = [{ type: 'remove', mutationId: 'm1', targetId: '2' }];

		const result = replay(server, entries);

		expect(result).toEqual([{ id: '1', name: 'Alice' }]);
	});

	it('should append multiple items for add-batch entry', () => {
		const server: TestItem[] = [{ id: '1', name: 'Alice' }];
		const entries: MutationEntry<TestItem>[] = [
			{
				type: 'add-batch',
				mutationId: 'm1',
				tempIds: ['temp-1', 'temp-2'],
				data: [{ name: 'Charlie' }, { name: 'Dana' }]
			}
		];

		const result = replay(server, entries);

		expect(result).toEqual([
			{ id: '1', name: 'Alice' },
			{ id: 'temp-1', name: 'Charlie' },
			{ id: 'temp-2', name: 'Dana' }
		]);
	});

	it('should filter out multiple items for remove-batch entry', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' },
			{ id: '3', name: 'Charlie' }
		];
		const entries: MutationEntry<TestItem>[] = [{ type: 'remove-batch', mutationId: 'm1', targetIds: ['1', '3'] }];

		const result = replay(server, entries);

		expect(result).toEqual([{ id: '2', name: 'Bob' }]);
	});

	it('should compose mixed entry types in order', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' }
		];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Charlie' } },
			{ type: 'update', mutationId: 'm2', targetId: '1', data: { name: 'Alicia' } },
			{ type: 'remove', mutationId: 'm3', targetId: '2' }
		];

		const result = replay(server, entries);

		expect(result).toEqual([
			{ id: '1', name: 'Alicia' },
			{ id: 'temp-1', name: 'Charlie' }
		]);
	});

	it('should apply beforeAdd hook with displacement for add entry', () => {
		const server: TestItem[] = [{ id: '1', name: 'Alice' }];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Alice-v2' } }
		];

		const beforeAdd = (items: TestItem[], data: Omit<TestItem, 'id'>) => {
			const existing = items.find((i) => i.name === data.name.replace('-v2', ''));
			if (existing) {
				return { items: items.filter((i) => i.id !== existing.id), displaced: existing };
			}
			return { items };
		};

		const result = replay(server, entries, beforeAdd);

		expect(result).toEqual([{ id: 'temp-1', name: 'Alice-v2' }]);
	});

	it('should apply beforeAdd hook without displacement', () => {
		const server: TestItem[] = [{ id: '1', name: 'Alice' }];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Brand New' } }
		];

		const beforeAdd = (items: TestItem[], _data: Omit<TestItem, 'id'>) => {
			return { items };
		};

		const result = replay(server, entries, beforeAdd);

		expect(result).toEqual([
			{ id: '1', name: 'Alice' },
			{ id: 'temp-1', name: 'Brand New' }
		]);
	});

	it('should handle concurrent updates to independent targets', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' }
		];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'update', mutationId: 'm1', targetId: '1', data: { name: 'Alicia' } },
			{ type: 'update', mutationId: 'm2', targetId: '2', data: { name: 'Bobby' } }
		];

		const result = replay(server, entries);

		expect(result).toEqual([
			{ id: '1', name: 'Alicia' },
			{ id: '2', name: 'Bobby' }
		]);
	});

	it('should not mutate the input serverState or entries arrays', () => {
		const server: TestItem[] = [{ id: '1', name: 'Alice' }];
		const entries: MutationEntry<TestItem>[] = [
			{ type: 'add', mutationId: 'm1', tempId: 'temp-1', data: { name: 'Bob' } }
		];

		const serverCopy = [...server];
		const entriesCopy = [...entries];

		replay(server, entries);

		expect(server).toEqual(serverCopy);
		expect(entries).toEqual(entriesCopy);
	});

	it('should return serverState unchanged when log is empty', () => {
		const server: TestItem[] = [
			{ id: '1', name: 'Alice' },
			{ id: '2', name: 'Bob' }
		];
		const entries: MutationEntry<TestItem>[] = [];

		const result = replay(server, entries);

		expect(result).toEqual(server);
	});
});
