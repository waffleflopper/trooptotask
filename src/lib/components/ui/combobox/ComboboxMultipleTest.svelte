<script lang="ts">
	import * as Combobox from './index.js';

	const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'];
	let selected = $state<string[]>(['Next.js']);
</script>

<Combobox.Root items={frameworks} multiple autoHighlight bind:value={selected} label="Frameworks">
	<Combobox.Chips data-testid="framework-combobox">
		<Combobox.Value>
			{#snippet children(values)}
				{#each values as value (value)}
					<Combobox.Chip {value}>{value}</Combobox.Chip>
				{/each}
				<Combobox.ChipsInput placeholder="Add framework" aria-label="Add framework" />
			{/snippet}
		</Combobox.Value>
	</Combobox.Chips>
	<Combobox.Content>
		<Combobox.Empty>No items found.</Combobox.Empty>
		<Combobox.List>
			{#snippet children(item)}
				<Combobox.Item value={item}>{item}</Combobox.Item>
			{/snippet}
		</Combobox.List>
	</Combobox.Content>
</Combobox.Root>

<button type="button">Outside control</button>

<output aria-label="Selected frameworks">{selected.join(',')}</output>
