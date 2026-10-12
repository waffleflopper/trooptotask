<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';

	const options = [
		{ value: 'ready', label: 'Ready' },
		{ value: 'watch', label: 'Watch' }
	];
</script>

<Field.Root>
	<Field.Label for="unit-status">Unit status</Field.Label>
	<Select.Root type="single" value="ready">
		<Select.Trigger id="unit-status">Ready</Select.Trigger>
		<Select.Content>
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>
</Field.Root>

<Select.Root type="single" value="watch">
	<Select.Trigger aria-label="Status filter">Watch</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>

<Field.Label for="board-status">Board status</Field.Label>
<Select.Root type="single" value="ready">
	<Select.Trigger id="board-status">Ready</Select.Trigger>
	<Select.Content aria-label="Board status choices">
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>

<label for="plain-status">Plain status</label>
<Select.Root type="single" value="ready">
	<Select.Trigger id="plain-status">Ready</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>
