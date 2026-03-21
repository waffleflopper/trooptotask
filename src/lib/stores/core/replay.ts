import type { BeforeAddHook } from './optimistic';

export type MutationEntry<T> =
	| { type: 'add'; mutationId: string; tempId: string; data: Omit<T, 'id'>; displaced?: T }
	| { type: 'update'; mutationId: string; targetId: string; data: Partial<T> }
	| { type: 'remove'; mutationId: string; targetId: string }
	| { type: 'add-batch'; mutationId: string; tempIds: string[]; data: Omit<T, 'id'>[] }
	| { type: 'remove-batch'; mutationId: string; targetIds: string[] };

export function replay<T extends { id: string }>(
	serverState: T[],
	entries: MutationEntry<T>[],
	beforeAdd?: BeforeAddHook<T>
): T[] {
	if (entries.length === 0) return serverState;

	let result = [...serverState];

	for (const entry of entries) {
		switch (entry.type) {
			case 'add': {
				if (beforeAdd) {
					const hookResult = beforeAdd(result, entry.data);
					result = hookResult.items;
				}
				const optimistic = { id: entry.tempId, ...entry.data } as T;
				result = [...result, optimistic];
				break;
			}
			case 'update': {
				result = result.map((item) => (item.id === entry.targetId ? { ...item, ...entry.data } : item));
				break;
			}
			case 'remove': {
				result = result.filter((item) => item.id !== entry.targetId);
				break;
			}
			case 'add-batch': {
				const optimistics = entry.tempIds.map((tempId, i) => ({ id: tempId, ...entry.data[i] }) as T);
				result = [...result, ...optimistics];
				break;
			}
			case 'remove-batch': {
				const ids = new Set(entry.targetIds);
				result = result.filter((item) => !ids.has(item.id));
				break;
			}
		}
	}

	return result;
}
