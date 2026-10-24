<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		editing: boolean;
		/** `row` drops the card chrome for an editor that sits inside a surface the host already draws, such as a table row. */
		variant?: 'card' | 'row';
		/** Names the open editor for assistive technology. */
		label: string;
		/** The command in flight. It disables every footer action so a second command cannot overlap it. */
		pending?: 'save' | 'archive' | null;
		error?: string;
		/** Holds Save back, such as while nothing has changed. */
		saveDisabled?: boolean;
		onSave: () => void;
		onCancel: () => void;
		/** Shows an Archive action in the editor; the read view carries none. */
		onArchive?: () => void;
		/** What shows when the row is not editing. A host that mounts the editor only while editing omits it. */
		display?: Snippet;
		editor: Snippet;
		/** A control that sits before Archive in the editor footer, such as a due date. */
		lead?: Snippet;
		/** A control that sits before Cancel, such as a link to the full form. */
		actions?: Snippet;
	}

	let {
		editing,
		variant = 'card',
		label,
		pending = null,
		error = '',
		saveDisabled = false,
		onSave,
		onCancel,
		onArchive,
		display,
		editor,
		lead,
		actions
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
		class={['grid gap-3', variant === 'card' && 'rounded-md border bg-muted/40 p-3']}
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
					<Button
						type="button"
						variant="link"
						size="sm"
						class="text-muted-foreground"
						disabled={pending !== null}
						onclick={onArchive}
					>
						Archive
					</Button>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{@render actions?.()}
				<Button type="button" variant="outline" size="sm" onclick={onCancel}>Cancel</Button>
				<Button type="submit" size="sm" disabled={pending !== null || saveDisabled}
					>{pending === 'save' ? 'Saving...' : 'Save'}</Button
				>
			</div>
		</div>
		{#if error}
			<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
		{/if}
	</form>
{:else}
	{@render display?.()}
{/if}
