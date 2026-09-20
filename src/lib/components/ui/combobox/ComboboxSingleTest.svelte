<script lang="ts">
	import * as Combobox from './index.js';

	let {
		searchable = true,
		disabled = false,
		onValueChange
	}: { searchable?: boolean; disabled?: boolean; onValueChange?: (value: string | string[]) => void } = $props();
	let selected = $state('');
	const people = [
		{ value: 'avery', label: 'Avery Brooks', description: 'HQ' },
		{ value: 'jon', label: 'Jon Bell', description: 'B Co', disabled: true },
		{ value: 'maya', label: 'Maya Chen', description: 'A Co' }
	];
</script>

<Combobox.Root items={people} bind:value={selected} label="Person" autoHighlight {disabled} {onValueChange}>
	<Combobox.Trigger clearable placeholder="Search personnel..." aria-label="Person" />
	<Combobox.Content>
		{#if searchable}<Combobox.Search placeholder="Search personnel..." />{/if}
		<Combobox.Empty>No people found.</Combobox.Empty>
		<Combobox.List />
	</Combobox.Content>
</Combobox.Root>

<button type="button">Outside control</button>

<output aria-label="Selected person">{selected}</output>
