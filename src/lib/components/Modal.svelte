<script lang="ts">
	import type { Snippet } from 'svelte';

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
		titleId = 'modal-title',
		canClose = true,
		showCloseButton = true,
		headerActions,
		children,
		footer
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && canClose) {
			e.preventDefault();
			onClose();
		}
	}

	function handleClose() {
		if (canClose) onClose();
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby={titleId}
	tabindex="-1"
	onkeydown={handleKeydown}
>
	<button class="modal-backdrop" onclick={handleClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" role="document" style:width={width} style:max-width="95vw">
		<div class="modal-header">
			<h2 id={titleId}>{title}</h2>
			{#if headerActions || (showCloseButton && canClose)}
				<div class="header-actions">
					{#if headerActions}
						{@render headerActions()}
					{/if}
					{#if showCloseButton && canClose}
						<button class="btn btn-secondary btn-sm close-btn" onclick={handleClose} aria-label="Close"
							>&times;</button
						>
					{/if}
				</div>
			{/if}
		</div>

		<div class="modal-body">
			{@render children()}
		</div>

		{#if footer}
			<div class="modal-footer">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.modal-footer {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}
</style>
