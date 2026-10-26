<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';

	let {
		label,
		anyLabel,
		items,
		values,
		onChange,
		emptyText,
		menuTop
	}: {
		label: string;
		/** Placeholder while nothing is chosen, which means everyone matches. */
		anyLabel: string;
		items: readonly { value: string; label: string }[];
		values: readonly string[];
		onChange: (values: string[]) => void;
		emptyText: string;
		/** Shortcuts shown above the options inside the menu. */
		menuTop?: Snippet;
	} = $props();

	const inputId = $props.id();
	const names = $derived(new Map(items.map((item) => [item.value, item.label])));
</script>

<Field.Root class="gap-1.5 sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-3">
	<Field.Label for={inputId} class="sm:min-h-8 sm:items-center">{label}</Field.Label>
	<Combobox.Root
		{items}
		multiple
		value={[...values]}
		onValueChange={(next) => onChange(Array.isArray(next) ? next : [next])}
		{label}
	>
		<Combobox.Chips>
			<Combobox.Value>
				{#snippet children(selected)}
					{#each selected as value (value)}
						<Combobox.Chip {value}>{names.get(value) ?? value}</Combobox.Chip>
					{/each}
					<Combobox.ChipsInput id={inputId} placeholder={anyLabel} aria-label={label} />
				{/snippet}
			</Combobox.Value>
		</Combobox.Chips>
		<Combobox.Content>
			{@render menuTop?.()}
			<Combobox.Empty>{emptyText}</Combobox.Empty>
			<Combobox.List aria-label={label}>
				{#snippet children(value, option)}
					<Combobox.Item {value} label={option.label} />
				{/snippet}
			</Combobox.List>
		</Combobox.Content>
	</Combobox.Root>
</Field.Root>
