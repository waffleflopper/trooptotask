<script lang="ts">
	interface Props {
		message: string;
		variant?: 'box' | 'simple';
		actionLabel?: string;
		onAction?: () => void;
	}

	let { message, variant = 'box', actionLabel, onAction }: Props = $props();
</script>

{#if variant === 'simple'}
	<p class="empty-simple">{message}</p>
	{#if actionLabel && onAction}
		<div class="empty-action simple">
			<button class="btn btn-primary btn-sm" onclick={onAction}>{actionLabel}</button>
		</div>
	{/if}
{:else}
	<div class="empty-box">
		{message}
		{#if actionLabel && onAction}
			<div class="empty-action">
				<button class="btn btn-primary btn-sm" onclick={onAction}>{actionLabel}</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.empty-box {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.empty-simple {
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-md);
		text-align: center;
	}

	.empty-action {
		margin-top: var(--spacing-md);
	}

	.empty-action.simple {
		text-align: center;
		padding-bottom: var(--spacing-md);
	}
</style>
