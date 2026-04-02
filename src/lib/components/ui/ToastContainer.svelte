<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';

	const typeColors: Record<string, string> = {
		success: 'var(--success)',
		error: 'var(--danger)',
		warning: 'var(--amber-dark)',
		info: 'var(--info)'
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
		bottom: var(--sp-6);
		right: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		z-index: 1200;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-left: 4px solid var(--toast-color);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
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
		border-radius: var(--radius-pill);
		background: var(--toast-color);
		color: white;
		font-size: var(--text-xs);
		font-weight: 700;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
		font-size: var(--text-ui-sm);
		color: var(--text-primary);
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
		color: var(--text-tertiary);
		font-size: var(--text-base);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.toast-dismiss:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	@media (max-width: 640px) {
		.toast-container {
			bottom: var(--sp-4);
			right: var(--sp-4);
			left: var(--sp-4);
		}

		.toast {
			min-width: 0;
			max-width: none;
		}
	}
</style>
