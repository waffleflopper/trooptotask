<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import * as MultiSelect from '$lib/components/ui/multi-select/index.js';

	type Item = { value: string; label: string };

	let { label, items, value = $bindable<string[]>([]) }: { label: string; items: Item[]; value: string[] } = $props();
</script>

<Field.Root>
	<Field.Label>{label}</Field.Label>
	<MultiSelect.Root {items} multiple bind:value {label}>
		<MultiSelect.Trigger>
			<MultiSelect.Value>
				{#snippet children(values)}
					{#each values as selected (selected)}
						<MultiSelect.Chip value={selected}>
							{items.find((item) => item.value === selected)?.label ?? selected}
						</MultiSelect.Chip>
					{/each}
					<MultiSelect.Input placeholder={`Any ${label.toLowerCase()}`} aria-label={label} />
				{/snippet}
			</MultiSelect.Value>
		</MultiSelect.Trigger>
		<MultiSelect.Content>
			<MultiSelect.Empty>No options found.</MultiSelect.Empty>
			<MultiSelect.List />
		</MultiSelect.Content>
	</MultiSelect.Root>
</Field.Root>
