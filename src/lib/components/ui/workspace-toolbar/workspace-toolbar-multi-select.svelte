<script lang="ts">
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import { Button } from '$lib/components/ui/button';
	import * as Checkbox from '$lib/components/ui/checkbox';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { WorkspaceToolbarOption } from './types.js';

	type Props = {
		ariaLabel: string;
		label: string;
		options: WorkspaceToolbarOption[];
		value: string[];
		disabled?: boolean;
		onChange: (values: string[]) => void;
	};

	let { ariaLabel, label, options, value, disabled = false, onChange }: Props = $props();

	const selectedCount = $derived(value.length);
	const selectedSet = $derived(new Set(value));
	const triggerLabel = $derived(selectedCount > 0 ? `${label}: ${selectedCount}` : label);

	function toggleValue(optionValue: string, checked: boolean): void {
		if (checked) {
			onChange([...value, optionValue]);
			return;
		}
		onChange(value.filter((item) => item !== optionValue));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant={selectedCount > 0 ? 'secondary' : 'outline'} {disabled} aria-label={ariaLabel} {...props}>
				<ListFilter aria-hidden="true" />
				{triggerLabel}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-[min(20rem,calc(100vw-2rem))]">
		<DropdownMenu.Label>{label}</DropdownMenu.Label>
		{#each options as option (option.value)}
			<div class="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm">
				<Checkbox.Root
					checked={selectedSet.has(option.value)}
					onCheckedChange={(checked) => toggleValue(option.value, checked === true)}
					aria-label={option.label}
				/>
				<span>{option.label}</span>
			</div>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
