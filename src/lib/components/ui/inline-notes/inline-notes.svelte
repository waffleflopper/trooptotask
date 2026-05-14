<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { cn } from '$lib/utils.js';
	import type { InlineNote } from './types.js';

	interface Props {
		notes: InlineNote[];
		onAddNote?: (text: string) => void;
		resolveAuthor: (userId: string) => string;
		disabled?: boolean;
		open?: boolean;
		class?: string;
	}

	let {
		notes,
		onAddNote,
		resolveAuthor,
		disabled = false,
		open = $bindable(false),
		class: className
	}: Props = $props();

	let newNoteText = $state('');

	const canAdd = $derived(Boolean(onAddNote && !disabled && newNoteText.trim()));

	function handleSubmit() {
		const trimmed = newNoteText.trim();
		if (!trimmed || !onAddNote || disabled) return;
		onAddNote(trimmed);
		newNoteText = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function formatTimestamp(ts: string): string {
		const date = new Date(ts);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const hour = hours % 12 || 12;
		return `${months[date.getMonth()]} ${date.getDate()} at ${hour}:${minutes} ${ampm}`;
	}
</script>

<section data-slot="inline-notes" class={cn('mt-2 min-w-0', className)}>
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<ChevronRightIcon class={cn('size-4 transition-transform', open && 'rotate-90')} />
		<MessageSquareTextIcon class="size-4" />
		<span>Notes</span>
		{#if notes.length > 0}
			<Badge variant="secondary" class="h-5 px-1.5">{notes.length}</Badge>
		{/if}
	</button>

	{#if open}
		<div class="border-border/70 mt-2 ml-4 space-y-3 border-l pl-3">
			{#if notes.length === 0}
				<p class="text-muted-foreground text-sm">No notes yet.</p>
			{:else}
				<ul class="space-y-2">
					{#each notes as note (note.timestamp + note.userId + note.text)}
						<li class="bg-muted/40 rounded-lg border px-3 py-2">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="text-foreground text-sm font-medium">{resolveAuthor(note.userId)}</span>
								<span class="text-muted-foreground text-xs">{formatTimestamp(note.timestamp)}</span>
							</div>
							<p class="text-foreground mt-1 text-sm whitespace-pre-wrap">{note.text}</p>
						</li>
					{/each}
				</ul>
			{/if}

			{#if onAddNote && !disabled}
				<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
					<Textarea
						class="min-h-10 flex-1"
						placeholder="Add a note..."
						bind:value={newNoteText}
						onkeydown={handleKeydown}
					/>
					<Button type="button" size="sm" onclick={handleSubmit} disabled={!canAdd}>Add</Button>
				</div>
			{/if}
		</div>
	{/if}
</section>
