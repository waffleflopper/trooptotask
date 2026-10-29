import type { Group } from './group.types';

export interface GroupNode extends Group {
	readonly hasChildren: boolean;
	/** 0 for the reader's visible roots, then 1 and 2 below them. */
	readonly level: number;
}

export interface Band<T> {
	readonly node: GroupNode;
	/** People directly in this Group, in the caller's order. */
	readonly hq: readonly T[];
	readonly children: readonly Band<T>[];
	/** The whole subtree. */
	readonly count: number;
}

type GroupOf<T> = (item: T) => string | null;

export interface BandOptions {
	/** Bands from this Group alone instead of the roots. */
	top?: string;
	/** False rolls each top band's whole subtree into its `hq`, with no sub-bands. Defaults to true. */
	nested?: boolean;
}

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
	/** The visible root at or above `groupId`. */
	rootOf(groupId: string | null): GroupNode | undefined;
	/** The path from the reader's visible root, such as "2nd Squad › Alpha Team". A single root is left out below it. */
	label(id: string): string;
	/** Nested bands from the roots; empty bands are dropped. Unassigned people are not in any band. */
	bands<T>(items: readonly T[], groupOf: GroupOf<T>, options?: BandOptions): Band<T>[];
}

export interface GroupTreeOptions {
	/** Pins of an Organization-wide reader. Only top-level Groups can be pinned; other ids are ignored. */
	pinnedIds?: readonly string[];
}

/** A Group-scoped reader whose whole view is one Group with nothing under it; screens name it and draw no band. */
export function soleLeafGroup(tree: GroupTree, organizationWide: boolean): GroupNode | null {
	const [root, ...others] = tree.roots;
	return !organizationWide && root && others.length === 0 && !root.hasChildren ? root : null;
}

/**
 * A screen's Group filter offers the reader's top-level Groups, and a pick matches its whole subtree. Any other value,
 * such as a pick saved before the tree changed, matches everyone.
 */
export function groupFilterMatcher(
	tree: GroupTree,
	value: string | null | undefined
): (groupId: string | null) => boolean {
	const root = value ? tree.node(value) : undefined;
	return root?.level === 0 ? (groupId) => tree.contains(root.id, groupId) : () => true;
}

export interface GroupRow<T> {
	/** The Group's id, `hq:` and the id for a Group's own people, or `unassigned`. */
	key: string;
	label: string;
	/** 0 on a top-level row. */
	level: number;
	/** A Group row that sums the rows below it rather than adding to them. */
	subtotal: boolean;
	items: T[];
}

export interface GroupRowSet<T> {
	top: GroupRow<T>;
	/** The sub-group rows under `top` in tree order; empty while sub-groups are hidden. */
	below: GroupRow<T>[];
}

/**
 * Report rows: one per visible root counting its whole subtree, then Unassigned for anyone outside the tree. With
 * sub-groups shown, a Group whose sub-groups have people is a subtotal, its own people form a "<Group> HQ" row, and
 * every item sits in exactly one row that is not a subtotal.
 */
export function groupRows<T>(
	tree: GroupTree,
	items: readonly T[],
	groupOf: GroupOf<T>,
	showSubGroups: boolean
): GroupRowSet<T>[] {
	const subtree = (band: Band<T>): T[] => [...band.hq, ...band.children.flatMap(subtree)];
	const labelOf = (node: GroupNode) => (node.level === 0 ? tree.label(node.id) : node.name);
	const rowFor = (band: Band<T>, subtotal: boolean): GroupRow<T> => ({
		key: band.node.id,
		label: labelOf(band.node),
		level: band.node.level,
		subtotal,
		items: subtree(band)
	});
	const below = (band: Band<T>): GroupRow<T>[] =>
		band.children.flatMap((child) => {
			const subtotal = child.children.length > 0;
			return [rowFor(child, subtotal), ...(subtotal ? hqAndBelow(child) : [])];
		});
	const hqAndBelow = (band: Band<T>): GroupRow<T>[] => [
		...(band.hq.length > 0
			? [
					{
						key: `hq:${band.node.id}`,
						label: `${labelOf(band.node)} HQ`,
						level: band.node.level + 1,
						subtotal: false,
						items: [...band.hq]
					}
				]
			: []),
		...below(band)
	];

	const sets = tree.bands(items, groupOf).map((band): GroupRowSet<T> => {
		const nested = showSubGroups && band.children.length > 0;
		return { top: rowFor(band, nested), below: nested ? hqAndBelow(band) : [] };
	});
	const unassigned = items.filter((item) => !tree.node(groupOf(item) ?? ''));
	if (unassigned.length > 0) {
		sets.push({
			top: { key: 'unassigned', label: 'Unassigned', level: 0, subtotal: false, items: unassigned },
			below: []
		});
	}
	return sets;
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

	function label(id: string): string {
		const path = ancestry(id);
		if (path.length === 0) return byId.get(id)?.name ?? '';
		const names = path.map((step, index) => (index === 0 ? rootLabels.get(step)! : nodes.get(step)!.name));
		return (roots.length === 1 && names.length > 1 ? names.slice(1) : names).join(PATH_SEPARATOR);
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

	function bands<T>(items: readonly T[], groupOf: GroupOf<T>, { top, nested = true }: BandOptions = {}): Band<T>[] {
		const tops = top === undefined ? roots : [nodes.get(top)].filter((node) => node !== undefined);
		if (!nested) {
			return tops.flatMap((node) => {
				const hq = items.filter((item) => contains(node.id, groupOf(item)));
				return hq.length === 0 ? [] : [{ node, hq, children: [], count: hq.length }];
			});
		}
		const members = directMembers(items, groupOf);
		return tops.flatMap((node) => bandFor(node, members) ?? []);
	}

	return {
		ordered,
		roots,
		node: (id) => nodes.get(id),
		contains,
		rootOf: (groupId) => (groupId === null ? undefined : nodes.get(ancestry(groupId)[0] ?? '')),
		label,
		bands
	};
}
