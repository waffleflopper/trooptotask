<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';

	interface Props {
		/** Modal title displayed in header */
		title: string;
		/** Close handler - called on backdrop click, close button, or Escape key */
		onClose: () => void;
		/** Optional custom width (default: 480px) */
		width?: string;
		/** Optional ID for aria-labelledby (default: auto-generated) */
		titleId?: string;
		/** Whether the modal can be closed (default: true). Set to false during async operations. */
		canClose?: boolean;
		/** Whether to show the close button in header (default: true) */
		showCloseButton?: boolean;
		/** Optional extra content rendered in the header between the title and close button */
		headerActions?: Snippet;
		/** Body content slot */
		children: Snippet;
		/** Footer content slot (buttons) */
		footer?: Snippet;
	}

	let {
		title,
		onClose,
		width = '480px',
		titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`,
		canClose = true,
		showCloseButton = true,
		headerActions,
		children,
		footer
	}: Props = $props();
</script>

<AppDialog.Root open closeBlocked={!canClose} {onClose}>
	<AppDialog.Content {showCloseButton} closeBlocked={!canClose} style={`width: ${width}; max-width: 95vw;`}>
		<AppDialog.Header class="px-4 pt-4">
			<div class="flex items-start gap-3">
				<AppDialog.Title id={titleId} class="min-w-0 flex-1">{title}</AppDialog.Title>
				{#if headerActions}
					<div class="mr-9 flex shrink-0 items-center gap-2">
						{@render headerActions()}
					</div>
				{/if}
			</div>
		</AppDialog.Header>

		<AppDialog.Body>
			{@render children()}
		</AppDialog.Body>

		{#if footer}
			<AppDialog.Footer>
				{@render footer()}
			</AppDialog.Footer>
		{/if}
	</AppDialog.Content>
</AppDialog.Root>
