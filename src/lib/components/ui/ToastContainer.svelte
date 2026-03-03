<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';

	const typeColors: Record<string, string> = {
		success: 'var(--color-success)',
		error: 'var(--color-error)',
		warning: 'var(--color-warning)',
		info: 'var(--color-info)'
	};

	const typeIcons: Record<string, string> = {
		success: '✓',
		error: '✕',
		warning: '!',
		info: 'i'
	};
</script>

{#if toastStore.list.length > 0}
	<div class="toast-container" role="status" aria-live="polite">
		{#each toastStore.list as toast (toast.id)}
			<div class="toast" style="--toast-color: {typeColors[toast.type]}">
				<span class="toast-icon">{typeIcons[toast.type]}</span>
				<span class="toast-message">{toast.message}</span>
				<button class="toast-dismiss" onclick={() => toastStore.dismiss(toast.id)} aria-label="Dismiss">
					&times;
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		z-index: 1200;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--toast-color);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-3);
		min-width: 280px;
		max-width: 420px;
		pointer-events: auto;
		animation: toast-slide-in 0.2s ease-out;
	}

	@keyframes toast-slide-in {
		from {
			opacity: 0;
			transform: translateX(40px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.toast-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		background: var(--toast-color);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 700;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		line-height: 1.4;
	}

	.toast-dismiss {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.toast-dismiss:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	@media (max-width: 640px) {
		.toast-container {
			bottom: var(--spacing-md);
			right: var(--spacing-md);
			left: var(--spacing-md);
		}

		.toast {
			min-width: 0;
			max-width: none;
		}
	}
</style>
