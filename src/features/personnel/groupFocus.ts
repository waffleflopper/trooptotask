import type { GroupFocus, GroupTree } from './groupTree';

export const GROUP_FOCUS_PARAM = 'group';
const UNASSIGNED = 'unassigned';

/** A `?group=` that names nothing this reader can see is reported, never widened to the whole unit. */
export type GroupFocusRead = { kind: 'focus'; focus: GroupFocus } | { kind: 'unavailable' };

export interface GroupFocusReader {
	/** Organization-wide readers see Unassigned people and the "Whole unit" view. */
	organizationWide: boolean;
}

export function readGroupFocus(url: URL, tree: GroupTree, reader: GroupFocusReader): GroupFocusRead {
	const value = url.searchParams.get(GROUP_FOCUS_PARAM);
	if (!value) return { kind: 'focus', focus: { kind: 'all' } };
	if (value === UNASSIGNED) {
		return reader.organizationWide ? { kind: 'focus', focus: { kind: 'unassigned' } } : { kind: 'unavailable' };
	}
	return tree.node(value) ? { kind: 'focus', focus: { kind: 'group', id: value } } : { kind: 'unavailable' };
}

/** A Group-scoped reader's lone root is their whole view, so focusing it is the default focus and needs no address. */
export function canonicalGroupFocus(tree: GroupTree, focus: GroupFocus, reader: GroupFocusReader): GroupFocus {
	if (focus.kind !== 'group' || reader.organizationWide) return focus;
	return tree.roots.length === 1 && tree.roots[0].id === focus.id ? { kind: 'all' } : focus;
}

export function groupFocusValue(focus: GroupFocus): string | null {
	return focus.kind === 'group' ? focus.id : focus.kind === 'unassigned' ? UNASSIGNED : null;
}

/**
 * Picking in the focus control filters the screen, so it replaces history and Back leaves the screen. A drill from a
 * band or report row is navigation, so it pushes and Back returns to the wider view.
 */
export function groupFocusNavigation(
	url: URL,
	focus: GroupFocus,
	via: 'pick' | 'drill'
): { href: string; replaceState: boolean } {
	const next = new URL(url);
	const value = groupFocusValue(focus);
	if (value) next.searchParams.set(GROUP_FOCUS_PARAM, value);
	else next.searchParams.delete(GROUP_FOCUS_PARAM);
	return { href: `${next.pathname}${next.search}${next.hash}`, replaceState: via === 'pick' };
}

/** What the focus control names: the whole view reads by who is looking, a Group by its path. */
export function groupFocusLabel(tree: GroupTree, focus: GroupFocus, reader: GroupFocusReader): string {
	switch (focus.kind) {
		case 'unassigned':
			return 'Unassigned';
		case 'group':
			return tree.label(focus.id);
		case 'all':
			if (reader.organizationWide) return 'Whole unit';
			return tree.roots.length === 1 ? tree.label(tree.roots[0].id) : 'My Groups';
	}
}
