export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
	const merged = new Map(existing.map((item) => [item.id, item]));
	for (const item of incoming) {
		merged.set(item.id, item);
	}
	return [...merged.values()];
}
