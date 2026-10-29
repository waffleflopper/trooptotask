/** One node of the tree, listed depth first. A node's children are the rows after it one level deeper. */
export interface TreeSelectOption {
	id: string;
	label: string;
	/** 0 at the top level. */
	depth: number;
	count?: number;
	disabled?: boolean;
	/** Sets the row apart below a divider, for an entry outside the tree such as "nobody's". */
	aside?: boolean;
}

export interface TreeSelectRow {
	option: TreeSelectOption;
	hasChildren: boolean;
	expanded: boolean;
	parentId: string | null;
	/** False for an ancestor shown only as context for a query match. */
	match: boolean;
}

export interface TreeShape {
	parentOf: ReadonlyMap<string, string | null>;
	withChildren: ReadonlySet<string>;
}

export function treeShape(options: readonly TreeSelectOption[]): TreeShape {
	const parentOf = new Map<string, string | null>();
	const withChildren = new Set<string>();
	const path: TreeSelectOption[] = [];
	for (const option of options) {
		while (path.length > 0 && path[path.length - 1].depth >= option.depth) path.pop();
		const parent = option.aside ? undefined : path[path.length - 1];
		parentOf.set(option.id, parent?.id ?? null);
		if (parent) withChildren.add(parent.id);
		path.push(option);
	}
	return { parentOf, withChildren };
}

export function ancestorsOf(shape: TreeShape, id: string): string[] {
	const ancestors: string[] = [];
	for (let parent = shape.parentOf.get(id) ?? null; parent; parent = shape.parentOf.get(parent) ?? null) {
		ancestors.push(parent);
	}
	return ancestors;
}

/**
 * The rows a reader sees. Without a query a row shows when every ancestor is expanded. With one, the matches show with
 * their ancestors, all open, so a match deep in the tree keeps its context.
 */
export function visibleRows(
	options: readonly TreeSelectOption[],
	shape: TreeShape,
	expanded: ReadonlySet<string>,
	query: string
): TreeSelectRow[] {
	const needle = query.trim().toLocaleLowerCase();
	const row = (option: TreeSelectOption, open: boolean, match = true): TreeSelectRow => ({
		option,
		hasChildren: shape.withChildren.has(option.id),
		expanded: open && shape.withChildren.has(option.id),
		parentId: shape.parentOf.get(option.id) ?? null,
		match
	});
	if (needle) {
		const matches = new Set<string>();
		const opened = new Set<string>();
		for (const option of options) {
			if (!option.label.toLocaleLowerCase().includes(needle)) continue;
			matches.add(option.id);
			for (const ancestor of ancestorsOf(shape, option.id)) opened.add(ancestor);
		}
		return options
			.filter((option) => matches.has(option.id) || opened.has(option.id))
			.map((option) => row(option, opened.has(option.id), matches.has(option.id)));
	}
	return options
		.filter((option) => ancestorsOf(shape, option.id).every((ancestor) => expanded.has(ancestor)))
		.map((option) => row(option, expanded.has(option.id)));
}

/** Nodes under a chosen ancestor: shown chosen, never stored, since the ancestor already covers them. */
export function impliedIds(shape: TreeShape, value: readonly string[]): Set<string> {
	const chosen = new Set(value);
	const implied = new Set<string>();
	for (const id of shape.parentOf.keys()) {
		if (ancestorsOf(shape, id).some((ancestor) => chosen.has(ancestor))) implied.add(id);
	}
	return implied;
}

/**
 * Flips one node and returns the canonical value: chosen nodes in tree order with no node under another, then any ids
 * the tree does not know, untouched. Unchoosing a node never brings back what it covered.
 */
export function toggleSelection(
	options: readonly TreeSelectOption[],
	shape: TreeShape,
	value: readonly string[],
	id: string
): string[] {
	const chosen = new Set(value);
	if (chosen.has(id)) chosen.delete(id);
	else if (ancestorsOf(shape, id).some((ancestor) => chosen.has(ancestor))) return [...value];
	else chosen.add(id);
	const covered = (node: string) => ancestorsOf(shape, node).some((ancestor) => chosen.has(ancestor));
	const known = options.filter((option) => chosen.has(option.id) && !covered(option.id)).map((option) => option.id);
	const unknown = value.filter((node) => chosen.has(node) && !shape.parentOf.has(node));
	return [...known, ...unknown];
}
