<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		id,
		phrase,
		matches,
		value = $bindable(''),
		name
	}: {
		id: string;
		/** The exact text the person must type, shown in the label. */
		phrase: string;
		/** The caller's match rule, so each dialog keeps its own (case, spacing) comparison. */
		matches: boolean;
		value?: string;
		name?: string;
	} = $props();

	const hintId = $derived(`${id}-hint`);
</script>

<div class="grid gap-2">
	<Label for={id}>Type {phrase} to confirm</Label>
	<Input
		{id}
		{name}
		type="text"
		bind:value
		autocomplete="off"
		spellcheck="false"
		aria-describedby={matches ? undefined : hintId}
	/>
	{#if !matches}
		<p id={hintId} class="font-mono text-xs leading-5 text-muted-foreground">Keep typing. It has to match exactly.</p>
	{/if}
</div>
