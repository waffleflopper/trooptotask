<script lang="ts">
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Command from '$lib/components/ui/command';
	import { setEvaluatorFromPicker, type EvaluatorDraft } from '../utils/ratingSchemeEntryDraft';

	interface Props {
		id: string;
		label: string;
		value: EvaluatorDraft;
		people: { value: string; label: string }[];
		onChange: (next: EvaluatorDraft) => void;
		class?: string;
	}

	let { id, label, value, people, onChange, class: className }: Props = $props();

	// No person id starts with this; the option's value carries the typed name.
	const EXTERNAL_PREFIX = '\u0000external:';
	// Pins the option to the end of the list: it scores zero against anything typed and `forceMount` keeps it shown.
	const NEVER_MATCHES = '\u200b';

	let search = $state('');
	const typed = $derived(search.trim());
	const items = $derived(
		typed ? [...people, { value: EXTERNAL_PREFIX + typed, label: `Use "${typed}" as an external rater` }] : people
	);
	const selected = $derived(
		value.kind === 'person' ? value.personId : value.kind === 'external' ? EXTERNAL_PREFIX + value.name : ''
	);
	const personLabel = $derived(
		value.kind === 'person' ? (people.find((person) => person.value === value.personId)?.label ?? 'Unknown') : ''
	);

	function handleValueChange(next: string | string[]) {
		if (Array.isArray(next)) return;
		if (next.startsWith(EXTERNAL_PREFIX))
			onChange(setEvaluatorFromPicker({ externalName: next.slice(EXTERNAL_PREFIX.length) }));
		else onChange(setEvaluatorFromPicker(next ? { personId: next } : null));
	}
</script>

<Combobox.Root {items} value={selected} bind:search {label} autoHighlight onValueChange={handleValueChange}>
	<Combobox.Trigger {id} class={className} clearable placeholder="Search unit or type a name">
		{#if value.kind === 'person'}
			<span class="flex min-w-0 items-center gap-2">
				<span class="truncate">{personLabel}</span>
				<span class="shrink-0 font-mono text-[11px] text-muted-foreground">In unit</span>
			</span>
		{:else if value.kind === 'external'}
			<span class="flex min-w-0 items-center gap-2">
				<span class="truncate">{value.name}</span>
				<span class="shrink-0 font-mono text-[11px] text-expiring-foreground">External</span>
			</span>
		{:else}
			<span class="text-muted-foreground">Search unit or type a name</span>
		{/if}
	</Combobox.Trigger>
	<Combobox.Content>
		<Combobox.Search placeholder="Search unit or type a name..." />
		<Combobox.Empty>No one in the unit matches.</Combobox.Empty>
		<Command.List class="max-h-72 p-1" aria-label={label}>
			<Command.Group>
				{#each people as person (person.value)}
					<Combobox.Item value={person.value} label={person.label} />
				{/each}
			</Command.Group>
			{#if typed}
				<Command.Group forceMount>
					<Combobox.Item value={EXTERNAL_PREFIX + typed} searchValue={NEVER_MATCHES} forceMount>
						<span class="block whitespace-normal wrap-anywhere">Use "{typed}" as an external rater</span>
					</Combobox.Item>
				</Command.Group>
			{/if}
		</Command.List>
	</Combobox.Content>
</Combobox.Root>
