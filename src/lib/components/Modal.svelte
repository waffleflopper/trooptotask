<script lang="ts">
	import { onMount } from 'svelte';
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
		titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`,
		canClose = true,
		showCloseButton = true,
		headerActions,
		children,
		footer
	}: Props = $props();

	let overlayEl: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	onMount(() => {
		previouslyFocused = document.activeElement as HTMLElement;
		// Focus first focusable element inside the dialog, or the overlay as fallback
		const firstFocusable = overlayEl?.querySelector<HTMLElement>(FOCUSABLE);
		if (firstFocusable) {
			firstFocusable.focus();
		} else {
			overlayEl?.focus();
		}
		return () => previouslyFocused?.focus();
	});

	const FOCUSABLE =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && canClose) {
			e.preventDefault();
			onClose();
			return;
		}

		if (e.key === 'Tab' && overlayEl) {
			const focusable = Array.from(overlayEl.querySelectorAll<HTMLElement>(FOCUSABLE));
			if (focusable.length === 0) return;

			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function handleClose() {
		if (canClose) onClose();
	}
</script>

<div class="modal-overlay" tabindex="-1" onkeydown={handleKeydown} bind:this={overlayEl}>
	<button class="modal-backdrop" onclick={handleClose} tabindex="-1" aria-hidden="true"></button>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style:width style:max-width="95vw">
		<div class="modal-header">
			<h2 id={titleId}>{title}</h2>
			{#if headerActions || (showCloseButton && canClose)}
				<div class="header-actions">
					{#if headerActions}
						{@render headerActions()}
					{/if}
					{#if showCloseButton && canClose}
						<button class="btn btn-secondary btn-sm close-btn" onclick={handleClose} aria-label="Close">&times;</button>
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
