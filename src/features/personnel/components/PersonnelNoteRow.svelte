<script lang="ts">
	import { tick } from 'svelte';
	import * as InlineEditRow from '$lib/components/patterns/inline-edit-row';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelLeaderNote } from '../contracts';
	import { formatTimestampDayMonth, formatTimestampYear } from '../logModel';
	import type { LeaderNoteList } from '../workspace/leaderNoteList.svelte';

	interface Props {
		note: PersonnelLeaderNote;
		list: LeaderNoteList;
		editing: boolean;
		onEdit: () => void;
		onStopEditing: () => void;
	}

	let { note, list, editing, onEdit, onStopEditing }: Props = $props();

	let text = $state('');
	let saving = $state(false);
	let textButton = $state<HTMLElement | null>(null);

	const error = $derived(list.rowErrors[note.id] ?? '');

	function startEdit() {
		text = note.text;
		onEdit();
	}

	async function stopEditing() {
		onStopEditing();
		await tick();
		textButton?.focus();
	}

	async function save() {
		saving = true;
		const saved = await list.save(note.id, text);
		saving = false;
		if (saved && editing) await stopEditing();
	}

	async function archive() {
		if (await list.archive(note.id)) onStopEditing();
	}

	const focusOnMount = (node: HTMLElement) => node.focus();
</script>

<div class="border-b border-border py-3.5" data-note-id={note.id}>
	<div class="flex items-start gap-4">
		<div class="w-16 shrink-0">
			<p class="font-heading text-xl leading-tight font-semibold">{formatTimestampDayMonth(note.createdAt)}</p>
			<p class="font-mono text-[11px] text-muted-foreground">{formatTimestampYear(note.createdAt)}</p>
		</div>
		<div class="min-w-0 flex-1">
			<InlineEditRow.Root
				{editing}
				label="Edit note"
				{saving}
				{error}
				onSave={save}
				onCancel={stopEditing}
				onArchive={archive}
			>
				{#snippet display()}
					<div class="grid gap-1.5">
						<Button
							bind:ref={textButton}
							type="button"
							variant="ghost"
							size="none"
							class="h-auto min-w-0 justify-start px-0 text-left text-[15px] font-normal whitespace-pre-wrap wrap-anywhere hover:bg-transparent hover:underline dark:hover:bg-transparent"
							onclick={startEdit}
						>
							{note.text}
						</Button>
						<p class="text-[13px] text-muted-foreground">{note.author}</p>
						{#if error}
							<p role="alert" class="text-sm text-destructive-text">{error}</p>
						{/if}
					</div>
				{/snippet}
				{#snippet editor()}
					<Textarea bind:value={text} rows={3} aria-label="Note text" {@attach focusOnMount} />
				{/snippet}
			</InlineEditRow.Root>
		</div>
	</div>
</div>
