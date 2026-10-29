<script lang="ts">
	import { TreeSelect, type TreeSelectOption } from '$lib/components/patterns/tree-select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { GroupFocusState } from '../groupFocusState.svelte';
	import type { GroupFocus } from '../groupTree';

	interface Props {
		focus: GroupFocusState;
		/** Everyone the reader can see on this screen, before search, so each count is the Group's whole strength. */
		people: readonly { groupId: string | null }[];
		class?: string;
	}

	let { focus, people, class: className }: Props = $props();

	// Group ids are UUIDs, so these never collide with one.
	const WHOLE_VIEW = '__whole';
	const UNASSIGNED = 'unassigned';

	const tree = $derived(focus.tree);
	const counts = $derived(tree.subtreeCounts(people, (person) => person.groupId));
	const unassignedCount = $derived(people.filter((person) => person.groupId === null).length);
	const singleRoot = $derived(!focus.organizationWide && tree.roots.length === 1 ? tree.roots[0] : null);

	const options = $derived.by<TreeSelectOption[]>(() => {
		const nodes = tree.ordered.map((node) => ({
			id: node.id,
			label: node.name,
			depth: node.level,
			count: counts.get(node.id) ?? 0
		}));
		if (singleRoot) return nodes;
		const whole = { id: WHOLE_VIEW, depth: 0, count: people.length };
		if (!focus.organizationWide) return [{ ...whole, label: 'My Groups' }, ...nodes];
		return [
			{ ...whole, label: 'Whole unit' },
			...nodes,
			{
				id: UNASSIGNED,
				label: 'Unassigned',
				depth: 0,
				count: unassignedCount,
				disabled: unassignedCount === 0,
				aside: true
			}
		];
	});

	const current = $derived(focus.focus);
	const value = $derived.by(() => {
		if (!current) return null;
		if (current.kind === 'unassigned') return UNASSIGNED;
		if (current.kind === 'group') return current.id;
		return singleRoot?.id ?? WHOLE_VIEW;
	});
	const valueCount = $derived.by(() => {
		if (!current || current.kind === 'all') return people.length;
		return current.kind === 'unassigned' ? unassignedCount : (counts.get(current.id) ?? 0);
	});

	function pick(id: string) {
		const next: GroupFocus =
			id === WHOLE_VIEW ? { kind: 'all' } : id === UNASSIGNED ? { kind: 'unassigned' } : { kind: 'group', id };
		focus.go(next, 'pick');
	}
</script>

{#if focus.status.kind === 'pending'}
	<Skeleton class="h-8 w-48 max-sm:h-9 max-sm:w-full {className ?? ''}" />
{:else}
	<TreeSelect
		{options}
		{value}
		onValueChange={pick}
		label="Group"
		valueLabel={focus.label}
		{valueCount}
		placeholder="Unavailable"
		searchPlaceholder="Find a Group"
		class={className}
	/>
{/if}
