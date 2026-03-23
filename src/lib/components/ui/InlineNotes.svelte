<script lang="ts">
	interface Note {
		text: string;
		timestamp: string;
		userId: string;
	}

	interface Props {
		notes: Note[];
		onAddNote?: (text: string) => void;
		resolveAuthor: (userId: string) => string;
		disabled?: boolean;
	}

	let { notes, onAddNote, resolveAuthor, disabled = false }: Props = $props();

	let expanded = $state(false);
	let newNoteText = $state('');

	function handleSubmit() {
		const trimmed = newNoteText.trim();
		if (!trimmed || !onAddNote) return;
		onAddNote(trimmed);
		newNoteText = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function formatTimestamp(ts: string): string {
		const date = new Date(ts);
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="inline-notes">
	<button type="button" class="toggle-btn" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
		<span class="toggle-icon" class:expanded>&#9656;</span>
		Notes {#if notes.length > 0}<span class="count">({notes.length})</span>{/if}
	</button>

	{#if expanded}
		<div class="notes-body">
			{#if notes.length === 0}
				<p class="empty">No notes yet.</p>
			{:else}
				<ul class="note-list">
					{#each notes as note (note.timestamp + note.userId)}
						<li class="note-item">
							<div class="note-header">
								<span class="note-author">{resolveAuthor(note.userId)}</span>
								<span class="note-time">{formatTimestamp(note.timestamp)}</span>
							</div>
							<p class="note-text">{note.text}</p>
						</li>
					{/each}
				</ul>
			{/if}

			{#if onAddNote && !disabled}
				<div class="add-note">
					<input
						type="text"
						class="input"
						placeholder="Add a note..."
						bind:value={newNoteText}
						onkeydown={handleKeydown}
					/>
					<button type="button" class="btn-primary btn-sm" onclick={handleSubmit} disabled={!newNoteText.trim()}>
						Add
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.inline-notes {
		margin-top: var(--spacing-sm);
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: none;
		border: none;
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.toggle-btn:hover {
		color: var(--color-text);
	}

	.toggle-icon {
		display: inline-block;
		transition: transform 0.15s ease;
		font-size: var(--font-size-xs);
	}

	.toggle-icon.expanded {
		transform: rotate(90deg);
	}

	.count {
		color: var(--color-text-muted);
	}

	.notes-body {
		padding-left: var(--spacing-md);
		margin-top: var(--spacing-xs);
	}

	.empty {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.note-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.note-item {
		padding: var(--spacing-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
	}

	.note-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.note-author {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.note-time {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.note-text {
		font-size: var(--font-size-base);
		color: var(--color-text);
		margin: 0;
		white-space: pre-wrap;
	}

	.add-note {
		display: flex;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-sm);
	}

	.add-note .input {
		flex: 1;
	}
</style>
