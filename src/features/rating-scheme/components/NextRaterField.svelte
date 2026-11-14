<script lang="ts">
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import { rosterOptions, type EvaluatorDraft } from '../utils/evaluatorDraft';
	import EvaluatorField from './EvaluatorField.svelte';
	import * as Field from '$lib/components/ui/field';

	interface Props {
		id: string;
		value: EvaluatorDraft;
		personnel: readonly PersonnelLookup[];
		/** A completed Change of Rater, or one that already moved its scheme, shows its next rater without a picker. */
		locked?: boolean;
		hint: string;
		onChange: (next: EvaluatorDraft) => void;
	}

	let { id, value, personnel, locked = false, hint, onChange }: Props = $props();

	const people = $derived(rosterOptions(personnel));
	const named = $derived.by(() => {
		if (value.kind === 'external') return value.name;
		if (value.kind === 'empty') return 'None named';
		const personId = value.personId;
		return people.find((person) => person.value === personId)?.label ?? 'Someone no longer in Personnel';
	});
</script>

<Field.Root class="gap-1.5">
	<div class="flex justify-between">
		{#if locked}
			<Field.Title class="text-sm font-medium">Next rater</Field.Title>
		{:else}
			<Field.Label for={id}>Next rater</Field.Label>
			<span class="text-[13px] text-muted-foreground">Optional</span>
		{/if}
	</div>
	{#if locked}
		<p class="flex h-9 min-w-0 items-center truncate rounded-md border bg-muted px-2.5 text-sm" aria-label="Next rater">
			{named}
		</p>
	{:else}
		<EvaluatorField {id} label="Next rater" {value} {people} {onChange} class="h-9" />
	{/if}
	<Field.Description>{hint}</Field.Description>
</Field.Root>
