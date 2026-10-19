import type { AttentionTarget } from './personnelReadiness.types';

export type ReadinessItemKind = 'training' | 'critical-task';

/** The Readiness drawer to open: one item, or a picker when `id` is null. */
export interface ReadinessDrawerTarget {
	kind: ReadinessItemKind;
	id: string | null;
}

const KINDS: readonly ReadinessItemKind[] = ['training', 'critical-task'];

function isKind(value: string | null): value is ReadinessItemKind {
	return KINDS.includes(value as ReadinessItemKind);
}

/** Reads `?item=<kind>:<id>` or the Add to record intent `?add=<kind>`. */
export function readinessDrawerFromSearch(search: URLSearchParams): ReadinessDrawerTarget | null {
	const item = search.get('item');
	if (item) {
		const separator = item.indexOf(':');
		const kind = item.slice(0, separator);
		const id = item.slice(separator + 1);
		if (separator > 0 && isKind(kind) && id) return { kind, id };
	}
	const add = search.get('add');
	return isKind(add) ? { kind: add, id: null } : null;
}

/** The Readiness tab query that opens an attention row's item. */
export function readinessTargetSearch(target: AttentionTarget): string {
	return target.item ? `?${new URLSearchParams({ item: `${target.item.kind}:${target.item.id}` })}` : '';
}
