export function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V | undefined): ReadonlyMap<K, V> {
	const next = new Map(map);
	if (value === undefined) next.delete(key);
	else next.set(key, value);
	return next;
}

export function withEntries<K, V>(map: ReadonlyMap<K, V>, entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
	const next = new Map(map);
	for (const [key, value] of entries) next.set(key, value);
	return next;
}

export function withMember<T>(set: ReadonlySet<T>, value: T, member: boolean): ReadonlySet<T> {
	const next = new Set(set);
	if (member) next.add(value);
	else next.delete(value);
	return next;
}

export function indexBy<K, V>(values: readonly V[], key: (value: V) => K): ReadonlyMap<K, V> {
	return new Map(values.map((value) => [key(value), value]));
}

export function emptySet<T>(): ReadonlySet<T> {
	return new Set();
}

export function emptyMap<K, V>(): ReadonlyMap<K, V> {
	return new Map();
}
