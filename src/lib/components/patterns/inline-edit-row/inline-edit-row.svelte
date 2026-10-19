<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		editing: boolean;
		/** Names the open editor for assistive technology. */
		label: string;
		saving?: boolean;
		error?: string;
		onSave: () => void;
		onCancel: () => void;
		/** Shows an Archive action in the editor; the read view carries none. */
		onArchive?: () => void;
		display: Snippet;
		editor: Snippet;
		/** A control that sits before Archive in the editor footer, such as a due date. */
		lead?: Snippet;
	}

	let {
		editing,
		label,
		saving = false,
		error = '',
		onSave,
		onCancel,
		onArchive,
		display,
		editor,
		lead
	}: Props = $props();

	function cancelOnEscape(node: HTMLElement) {
		function onkeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			event.preventDefault();
			onCancel();
		}
		node.addEventListener('keydown', onkeydown);
		return () => node.removeEventListener('keydown', onkeydown);
	}
</script>

{#if editing}
	<form
		data-slot="inline-edit-row"
		aria-label={label}
		class="grid gap-3 rounded-md border bg-muted/40 p-3"
		{@attach cancelOnEscape}
		onsubmit={(event) => {
			event.preventDefault();
			onSave();
		}}
	>
		{@render editor()}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap items-center gap-3">
				{@render lead?.()}
				{#if onArchive}
					<Button type="button" variant="link" size="sm" class="text-muted-foreground" onclick={onArchive}>
						Archive
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button type="button" variant="outline" size="sm" onclick={onCancel}>Cancel</Button>
				<Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
			</div>
		</div>
		{#if error}
			<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
		{/if}
	</form>
{:else}
	{@render display()}
{/if}
