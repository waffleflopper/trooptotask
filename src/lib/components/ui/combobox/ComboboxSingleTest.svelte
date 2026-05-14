<script lang="ts">
	import * as Combobox from './index.js';

	let selected = $state('');
	const people = [
		{ value: 'avery', label: 'Avery Brooks', description: 'HQ' },
		{ value: 'maya', label: 'Maya Chen', description: 'A Co' },
		{ value: 'jon', label: 'Jon Bell', description: 'B Co', disabled: true }
	];
</script>

<Combobox.Root items={people} bind:value={selected} label="Person" autoHighlight>
	<Combobox.Trigger clearable placeholder="Search personnel..." aria-label="Person" />
	<Combobox.Content>
		<Combobox.Search placeholder="Search personnel..." />
		<Combobox.Empty>No people found.</Combobox.Empty>
		<Combobox.List />
	</Combobox.Content>
</Combobox.Root>

<output aria-label="Selected person">{selected}</output>
