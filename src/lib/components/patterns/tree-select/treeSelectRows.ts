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
	const row = (option: TreeSelectOption, open: boolean): TreeSelectRow => ({
		option,
		hasChildren: shape.withChildren.has(option.id),
		expanded: open && shape.withChildren.has(option.id),
		parentId: shape.parentOf.get(option.id) ?? null
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
			.map((option) => row(option, opened.has(option.id)));
	}
	return options
		.filter((option) => ancestorsOf(shape, option.id).every((ancestor) => expanded.has(ancestor)))
		.map((option) => row(option, expanded.has(option.id)));
}
