<script lang="ts">
	import { untrack } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelLogNotes } from '../contracts';
	import { LeaderNoteList } from '../workspace/leaderNoteList.svelte';
	import PersonnelNoteRow from './PersonnelNoteRow.svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		subject: string;
		initial: PersonnelLogNotes;
		focusAdd: boolean;
		editingKey: string | null;
		onEditingKey: (key: string | null) => void;
	}

	let { orgId, personnelId, subject, initial, focusAdd, editingKey, onEditingKey }: Props = $props();

	const list = untrack(
		() => new LeaderNoteList(initial, { orgId, personnelId, fetch: (input, init) => fetch(input, init) })
	);
	let composer = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (focusAdd) composer?.focus();
	});

	const keyOf = (id: string) => `note:${id}`;
	const finishEdit = (key: string) => {
		if (editingKey === key) onEditingKey(null);
	};
</script>

<PageShell.SectionHeader
	eyebrow="Leader notes"
	title={`${list.count} ${list.count === 1 ? 'note' : 'notes'}`}
	detail="No action needed. Use a follow-up for that."
/>

<form
	class="mt-3.5 grid gap-2.5 rounded-md border bg-background p-3"
	onsubmit={(event) => {
		event.preventDefault();
		void list.draft.submit();
	}}
>
	<Field.Root data-invalid={list.draft.fieldError('text') ? true : undefined}>
		<Textarea
			bind:ref={composer}
			bind:value={list.draft.fields.text}
			rows={2}
			aria-label="New leader note"
			aria-invalid={list.draft.fieldError('text') ? 'true' : undefined}
			aria-describedby={list.draft.fieldError('text') ? 'leader-note-quick-add-error' : undefined}
			placeholder={`Write a note about ${subject}…`}
		/>
		{#if list.draft.fieldError('text')}
			<Field.Error id="leader-note-quick-add-error">{list.draft.fieldError('text')}</Field.Error>
		{/if}
	</Field.Root>
	<div class="flex justify-end">
		<Button type="submit" variant="outline" size="sm" disabled={list.draft.saving}>
			{list.draft.saving ? 'Saving...' : 'Save note'}
		</Button>
	</div>
	{#if list.draft.error}
		<Alert.Root variant="destructive"><Alert.Description>{list.draft.error}</Alert.Description></Alert.Root>
	{/if}
</form>

<div class="mt-2">
	{#each list.rows as note (note.id)}
		<PersonnelNoteRow
			{note}
			{list}
			editing={editingKey === keyOf(note.id)}
			onEdit={() => onEditingKey(keyOf(note.id))}
			onStopEditing={() => finishEdit(keyOf(note.id))}
		/>
	{:else}
		<p class="py-6 text-sm text-muted-foreground">No notes yet.</p>
	{/each}

	{#if list.olderRemaining > 0}
		<div class="py-3.5">
			<Button
				type="button"
				variant="link"
				size="sm"
				class="h-auto p-0"
				disabled={list.loadingOlder}
				onclick={() => list.loadOlder()}
			>
				{list.loadingOlder
					? 'Loading...'
					: `Show ${list.olderRemaining} older ${list.olderRemaining === 1 ? 'note' : 'notes'}`}
			</Button>
			{#if list.olderError}
				<p role="alert" class="mt-2 text-sm text-destructive-text">{list.olderError}</p>
			{/if}
		</div>
	{/if}
</div>
