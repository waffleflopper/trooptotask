import type { MutationEntry } from './replay';

export interface MutationLog<T extends { id: string }> {
	readonly entries: MutationEntry<T>[];
	readonly pending: number;
	push(entry: MutationEntry<T>): void;
	resolve(mutationId: string): void;
	clear(): void;
}

export function createMutationLog<T extends { id: string }>(): MutationLog<T> {
	let entries = $state.raw<MutationEntry<T>[]>([]);

	return {
		get entries() {
			return entries;
		},
		get pending() {
			return entries.length;
		},
		push(entry: MutationEntry<T>) {
			entries = [...entries, entry];
		},
		resolve(mutationId: string) {
			entries = entries.filter((e) => e.mutationId !== mutationId);
		},
		clear() {
			entries = [];
		}
	};
}
