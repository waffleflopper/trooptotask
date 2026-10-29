import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { Group } from './contracts';
import {
	canonicalGroupFocus,
	GROUP_FOCUS_PARAM,
	groupFocusLabel,
	groupFocusNavigation,
	readGroupFocus,
	type GroupFocusRead
} from './groupFocus';
import { buildGroupTree, type GroupFocus, type GroupTree } from './groupTree';

export interface GroupFocusSource {
	/** The Group catalog for this Organization, or null while it loads. */
	groups: readonly Group[] | null;
	pinnedIds: readonly string[];
	organizationWide: boolean;
}

/** Until the catalog loads, a `?group=` cannot be judged, so the screen shows nobody rather than the wrong people. */
export type GroupFocusStatus = GroupFocusRead | { kind: 'pending' };

/** The reader's Group focus on the current page, read from the address. Loads ignore it; screens narrow with `within`. */
export class GroupFocusState {
	readonly #source: () => GroupFocusSource;

	constructor(source: () => GroupFocusSource) {
		this.#source = source;
	}

	get organizationWide(): boolean {
		return this.#source().organizationWide;
	}

	readonly tree: GroupTree = $derived.by(() => {
		const { groups, pinnedIds, organizationWide } = this.#source();
		return buildGroupTree(groups ?? [], { pinnedIds: organizationWide ? pinnedIds : [] });
	});

	readonly status: GroupFocusStatus = $derived.by(() => {
		if (this.#source().groups === null) {
			return page.url.searchParams.get(GROUP_FOCUS_PARAM)
				? { kind: 'pending' }
				: { kind: 'focus', focus: { kind: 'all' } };
		}
		return readGroupFocus(page.url, this.tree, { organizationWide: this.organizationWide });
	});

	get focus(): GroupFocus | null {
		return this.status.kind === 'focus' ? this.status.focus : null;
	}

	get label(): string | null {
		const focus = this.focus;
		return focus ? groupFocusLabel(this.tree, focus, { organizationWide: this.organizationWide }) : null;
	}

	/** A reader whose whole view is one Group with no sub-groups; their screens name it and draw no band. */
	get singleLeaf(): boolean {
		const roots = this.tree.roots;
		return !this.organizationWide && roots.length === 1 && !roots[0].hasChildren;
	}

	within<T>(items: readonly T[], groupOf: (item: T) => string | null): T[] {
		const focus = this.focus;
		return focus ? this.tree.within(focus, items, groupOf) : [];
	}

	go(focus: GroupFocus, via: 'pick' | 'drill'): void {
		const { href, replaceState } = groupFocusNavigation(page.url, canonicalGroupFocus(this.tree, focus, this), via);
		void goto(resolve(href as `/org/${string}`), { replaceState, keepFocus: true, noScroll: true });
	}
}
