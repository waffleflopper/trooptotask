import type { TreeSelectOption } from '$lib/components/patterns/tree-select';
import type { ScopeGroup } from './memberSettingsTypes';

export interface ScopeTree {
	/** Depth first, siblings in the order given. */
	readonly ordered: readonly (ScopeGroup & { level: number })[];
	readonly options: TreeSelectOption[];
	path(id: string): string;
	/** Drops ids an ancestor in the list already covers, and ids no Group has. */
	canonical(ids: readonly string[]): string[];
	summary(ids: readonly string[]): string;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function list(items: readonly string[]): string {
	// "plus" rather than "and", which already joins a Group to its sub-groups.
	return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} plus ${items.at(-1)}`;
}

export function scopeTree(groups: readonly ScopeGroup[]): ScopeTree {
	const byId = new Map(groups.map((group) => [group.id, group]));
	const isRoot = (group: ScopeGroup) => group.parentId === null || !byId.has(group.parentId);
	const ordered: (ScopeGroup & { level: number })[] = [];
	const visit = (group: ScopeGroup, level: number) => {
		ordered.push({ ...group, level });
		for (const child of groups) if (child.parentId === group.id) visit(child, level + 1);
	};
	for (const group of groups) if (isRoot(group)) visit(group, 0);

	const ancestors = (id: string): ScopeGroup[] => {
		const chain: ScopeGroup[] = [];
		for (let group = byId.get(id); group; group = group.parentId ? byId.get(group.parentId) : undefined)
			chain.unshift(group);
		return chain;
	};
	const below = (id: string) =>
		ordered.filter((group) => group.id !== id && ancestors(group.id).some((a) => a.id === id));
	const canonical = (ids: readonly string[]) =>
		ordered
			.filter((group) => ids.includes(group.id))
			.filter((group) => !ancestors(group.id).some((ancestor) => ancestor.id !== group.id && ids.includes(ancestor.id)))
			.map((group) => group.id);
	const counts = new Map(
		ordered.map((group) => [group.id, group.memberCount + below(group.id).reduce((sum, g) => sum + g.memberCount, 0)])
	);
	const path = (id: string) =>
		ancestors(id)
			.map((group) => group.name)
			.join(' › ') || 'Unknown group';

	return {
		ordered,
		options: ordered.map((group) => ({
			id: group.id,
			label: group.name,
			depth: group.level,
			count: counts.get(group.id)
		})),
		path,
		canonical,
		summary(ids) {
			const roots = canonical(ids);
			const parts = roots.map((id) => {
				const subGroups = below(id).length;
				const name = byId.get(id)!.name;
				return subGroups > 0 ? `${name} and its ${plural(subGroups, 'sub-group')}` : name;
			});
			const people = roots.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
			return `Sees ${list(parts)}: ${plural(people, 'person', 'people')}. Not Unassigned.`;
		}
	};
}
