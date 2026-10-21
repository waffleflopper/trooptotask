<script lang="ts" generics="T">
	import { tick, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';
	import type { FieldDraft } from './field-draft.svelte';
	import Status from './draft-field-status.svelte';

	type FieldAria = { 'aria-describedby': string; 'aria-invalid': true | undefined };

	let {
		draft,
		id,
		name,
		was,
		save,
		inlineStatus = true,
		field,
		children
	}: {
		draft: FieldDraft<T>;
		/** Prefixes the sentence and error ids the field is described by. */
		id: string;
		/** What the field is, for the Save and Undo names, such as "strength floor". */
		name: string;
		/** The saved value as the status states it, such as "80%". */
		was: string;
		save: (value: T) => Promise<void>;
		/** False when the row shows `DraftField.Status` in its control lane instead. */
		inlineStatus?: boolean;
		field: Snippet<[FieldAria]>;
		/** The live sentence that restates the draft's consequence. */
		children?: Snippet;
	} = $props();

	const aria = $derived<FieldAria>({
		'aria-describedby': draft.error ? `${id}-sentence ${id}-error` : `${id}-sentence`,
		'aria-invalid': draft.error ? true : undefined
	});

	let form = $state<HTMLFormElement>();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await draft.save(save);
		await tick();
		// A landed save removes the focused Save button; keep focus in the field instead of the page body.
		if (document.activeElement === document.body) form?.querySelector('input')?.focus();
	}
</script>

<!-- novalidate lets the server's field error show instead of the browser's range message. -->
<form
	bind:this={form}
	data-slot="draft-field"
	data-changed={draft.changed || undefined}
	class={cn(
		'grid gap-x-4 gap-y-2.5 rounded-sm border bg-muted px-3.5 py-3 md:flex md:flex-wrap md:items-center',
		draft.changed ? 'border-warning/60' : 'border-border'
	)}
	novalidate
	onsubmit={submit}
>
	<div class="flex shrink-0 items-center gap-3">{@render field(aria)}</div>
	<!-- A div, not a p, so a sentence can hold a block skeleton while part of it streams. -->
	<div id="{id}-sentence" class="min-w-0 flex-1 text-sm text-foreground">{@render children?.()}</div>
	{#if inlineStatus || draft.changed}
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			{#if inlineStatus}<Status {draft} {was} />{/if}
			{#if draft.changed}
				<Button type="button" size="sm" variant="ghost" onclick={() => draft.undo()} disabled={draft.saving}>
					Undo <span class="sr-only">{name} change</span>
				</Button>
				<!-- aria-disabled keeps focus on Save while it saves. -->
				<Button type="submit" size="sm" aria-disabled={draft.saving || undefined} aria-busy={draft.saving || undefined}>
					{#if draft.saving}<Spinner />{/if}
					{draft.saving ? 'Saving...' : 'Save'} <span class="sr-only">{name}</span>
				</Button>
			{/if}
		</div>
	{/if}
	{#if draft.error}
		<Field.Error id="{id}-error" class="basis-full">{draft.error}</Field.Error>
	{/if}
</form>
