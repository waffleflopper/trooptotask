<script lang="ts">
	import type { ClassValue } from 'clsx';
	import type { Group } from '../group.types';
	import { groupPickerOptions, UNASSIGNED_OPTION } from '../groupStructure';
	import { buildGroupTree } from '../groupTree';
	import { TreeSelect } from '$lib/components/patterns/tree-select';

	interface Props {
		groups: readonly Group[];
		/** The chosen Group's id, or an empty string for no Group. */
		value: string;
		allowUnassigned: boolean;
		id?: string;
		class?: ClassValue;
	}

	let { groups, value = $bindable(), allowUnassigned, id, class: className }: Props = $props();

	const NO_GROUP = 'No Group Assigned';
	const tree = $derived(buildGroupTree(groups));
	const options = $derived(groupPickerOptions(tree, { unassigned: allowUnassigned ? NO_GROUP : undefined }));
	const chosen = $derived(value && tree.node(value) ? value : null);
</script>

<TreeSelect
	label="Group"
	hideLabel
	placeholder="Select a Group"
	searchPlaceholder="Search Groups"
	value={chosen ?? (allowUnassigned ? UNASSIGNED_OPTION : null)}
	valueLabel={chosen ? tree.label(chosen) : allowUnassigned ? NO_GROUP : null}
	{options}
	onValueChange={(next: string) => (value = next === UNASSIGNED_OPTION ? '' : next)}
	{id}
	class={['h-9 w-full justify-between', className]}
/>
