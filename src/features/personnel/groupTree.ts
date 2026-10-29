import type { Group } from './group.types';

export interface GroupNode extends Group {
	readonly hasChildren: boolean;
	/** 0 for the reader's visible roots, then 1 and 2 below them. */
	readonly level: number;
}

/** The part of the unit a screen shows. Lives in the URL as `?group=<id>` or `?group=unassigned`. Grants nothing. */
export type GroupFocus = { kind: 'all' } | { kind: 'group'; id: string } | { kind: 'unassigned' };

export interface Band<T> {
	readonly node: GroupNode;
	/** People directly in this Group, in the caller's order. */
	readonly hq: readonly T[];
	readonly children: readonly Band<T>[];
	/** The whole subtree. */
	readonly count: number;
}

export type BreakdownRow<T> =
	| { kind: 'hq'; key: string; label: string; items: readonly T[] }
	| { kind: 'group'; key: string; label: string; items: readonly T[]; drill: GroupFocus }
	| { kind: 'unassigned'; key: 'unassigned'; label: 'Unassigned'; items: readonly T[] };

/** Rows partition `total`: each item appears in exactly one row. Empty rows are dropped. */
export interface Breakdown<T> {
	readonly total: readonly T[];
	/** Empty when the focus is a Group with no sub-groups, or Unassigned. */
	readonly rows: readonly BreakdownRow<T>[];
}

type GroupOf<T> = (item: T) => string | null;

/**
 * The Groups one reader can see, as a tree. The catalog is already trimmed to covered Groups, so a Group whose parent
 * is not in it is a root: a team leader's tree is one root. Pure and cheap; rebuild it with `$derived`.
 */
export interface GroupTree {
	/** Depth-first, siblings in Organization order; pinned top-level Groups lead. */
	readonly ordered: readonly GroupNode[];
	readonly roots: readonly GroupNode[];
	node(id: string): GroupNode | undefined;
	/** True when `groupId` is `ancestorId` or below it. */
	contains(ancestorId: string, groupId: string | null): boolean;
	/**
	 * The path from the reader's visible root, such as "2nd Squad › Alpha Team". A single root is left out below it
	 * unless `keepRoot` asks for it, as a choice between a root and a same-named child must.
	 */
	label(id: string, options?: { keepRoot?: boolean }): string;
	within<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): T[];
	/** Nested bands for the focus; empty bands are dropped. Unassigned people are not in any band. */
	bands<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): Band<T>[];
	breakdown<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): Breakdown<T>;
	/** People in each Group's subtree, keyed by Group id; every node has an entry. */
	subtreeCounts<T>(items: readonly T[], groupOf: GroupOf<T>): ReadonlyMap<string, number>;
	/** Drops any id whose ancestor is also listed, keeping first-seen order. */
	canonicalRoots(ids: readonly string[]): string[];
}

export interface GroupTreeOptions {
	/** Pins of an Organization-wide reader. Only top-level Groups can be pinned; other ids are ignored. */
	pinnedIds?: readonly string[];
}

const PATH_SEPARATOR = ' › ';

function siblingOrder(a: Group, b: Group): number {
	return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function buildGroupTree(groups: readonly Group[], options: GroupTreeOptions = {}): GroupTree {
	const byId = new Map(groups.map((group) => [group.id, group]));
	const childrenOf = new Map<string | null, Group[]>();
	for (const group of groups) {
		const parent = group.parentId !== null && byId.has(group.parentId) ? group.parentId : null;
		const siblings = childrenOf.get(parent);
		if (siblings) siblings.push(group);
		else childrenOf.set(parent, [group]);
	}
	for (const siblings of childrenOf.values()) siblings.sort(siblingOrder);

	const pinOrder = new Map(
		(options.pinnedIds ?? []).filter((id) => byId.get(id)?.parentId === null).map((id, index) => [id, index])
	);
	const rootGroups = [...(childrenOf.get(null) ?? [])].sort((a, b) => {
		const aPin = pinOrder.get(a.id) ?? Infinity;
		const bPin = pinOrder.get(b.id) ?? Infinity;
		return aPin - bPin || siblingOrder(a, b);
	});

	const nodes = new Map<string, GroupNode>();
	const parentOf = new Map<string, string | null>();
	const ordered: GroupNode[] = [];
	const visit = (group: Group, level: number, parent: string | null) => {
		const children = childrenOf.get(group.id) ?? [];
		const node: GroupNode = { ...group, hasChildren: children.length > 0, level };
		nodes.set(group.id, node);
		parentOf.set(group.id, parent);
		ordered.push(node);
		for (const child of children) visit(child, level + 1, group.id);
	};
	for (const root of rootGroups) visit(root, 0, null);
	const roots = rootGroups.map((group) => nodes.get(group.id)!);

	const rootLabels = new Map<string, string>();
	const seenRootNames = new Map<string, number>();
	for (const root of roots) {
		const seen = (seenRootNames.get(root.name) ?? 0) + 1;
		seenRootNames.set(root.name, seen);
		rootLabels.set(root.id, seen === 1 ? root.name : `${root.name} (${seen})`);
	}

	function ancestry(id: string): string[] {
		const path: string[] = [];
		for (let current: string | null | undefined = id; current; current = parentOf.get(current)) path.unshift(current);
		return path;
	}

	function contains(ancestorId: string, groupId: string | null): boolean {
		for (let current: string | null | undefined = groupId; current; current = parentOf.get(current)) {
			if (current === ancestorId) return true;
		}
		return false;
	}

	function label(id: string, { keepRoot = false }: { keepRoot?: boolean } = {}): string {
		const path = ancestry(id);
		if (path.length === 0) return byId.get(id)?.name ?? '';
		const names = path.map((step, index) => (index === 0 ? rootLabels.get(step)! : nodes.get(step)!.name));
		return (!keepRoot && roots.length === 1 && names.length > 1 ? names.slice(1) : names).join(PATH_SEPARATOR);
	}

	function within<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): T[] {
		switch (focus.kind) {
			case 'all':
				return [...items];
			case 'unassigned':
				return items.filter((item) => groupOf(item) === null);
			case 'group':
				return items.filter((item) => contains(focus.id, groupOf(item)));
		}
	}

	function directMembers<T>(items: readonly T[], groupOf: GroupOf<T>): Map<string, T[]> {
		const members = new Map<string, T[]>();
		for (const item of items) {
			const id = groupOf(item);
			if (id === null || !nodes.has(id)) continue;
			const list = members.get(id);
			if (list) list.push(item);
			else members.set(id, [item]);
		}
		return members;
	}

	function bandFor<T>(node: GroupNode, members: Map<string, T[]>): Band<T> | null {
		const hq = members.get(node.id) ?? [];
		const children = (childrenOf.get(node.id) ?? []).flatMap((child) => bandFor(nodes.get(child.id)!, members) ?? []);
		const count = hq.length + children.reduce((sum, child) => sum + child.count, 0);
		return count === 0 ? null : { node, hq, children, count };
	}

	function bands<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): Band<T>[] {
		const members = directMembers(items, groupOf);
		const tops = focus.kind === 'all' ? roots : focus.kind === 'group' ? [nodes.get(focus.id)].filter((n) => !!n) : [];
		return tops.flatMap((node) => bandFor(node, members) ?? []);
	}

	function breakdown<T>(focus: GroupFocus, items: readonly T[], groupOf: GroupOf<T>): Breakdown<T> {
		const total = within(focus, items, groupOf);
		const groupRow = (node: GroupNode): BreakdownRow<T> => ({
			kind: 'group',
			key: node.id,
			label: node.name,
			items: total.filter((item) => contains(node.id, groupOf(item))),
			drill: { kind: 'group', id: node.id }
		});
		const insideRows = (node: GroupNode | undefined): BreakdownRow<T>[] =>
			node?.hasChildren
				? [
						{
							kind: 'hq',
							key: `${node.id}:hq`,
							label: `${node.name} HQ`,
							items: total.filter((item) => groupOf(item) === node.id)
						},
						...(childrenOf.get(node.id) ?? []).map((child) => groupRow(nodes.get(child.id)!))
					]
				: [];
		let rows: BreakdownRow<T>[] = [];
		if (focus.kind === 'all') {
			rows = roots.length === 1 ? insideRows(roots[0]) : roots.map(groupRow);
			rows.push({
				kind: 'unassigned',
				key: 'unassigned',
				label: 'Unassigned',
				items: total.filter((item) => groupOf(item) === null)
			});
		} else if (focus.kind === 'group') {
			rows = insideRows(nodes.get(focus.id));
		}
		return { total, rows: rows.filter((row) => row.items.length > 0) };
	}

	function subtreeCounts<T>(items: readonly T[], groupOf: GroupOf<T>): ReadonlyMap<string, number> {
		const counts = new Map(ordered.map((node) => [node.id, 0]));
		for (const item of items) {
			for (let current = groupOf(item) ?? undefined; current; current = parentOf.get(current) ?? undefined) {
				if (counts.has(current)) counts.set(current, counts.get(current)! + 1);
			}
		}
		return counts;
	}

	function canonicalRoots(ids: readonly string[]): string[] {
		const listed = new Set(ids);
		const kept: string[] = [];
		for (const id of listed) {
			const covered = ancestry(id)
				.slice(0, -1)
				.some((ancestor) => listed.has(ancestor));
			if (!covered) kept.push(id);
		}
		return kept;
	}

	return {
		ordered,
		roots,
		node: (id) => nodes.get(id),
		contains,
		label,
		within,
		bands,
		breakdown,
		subtreeCounts,
		canonicalRoots
	};
}
