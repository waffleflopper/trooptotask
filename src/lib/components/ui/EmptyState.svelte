<script lang="ts">
	interface Props {
		message: string;
		variant?: 'box' | 'simple';
	}

	let { message, variant = 'box' }: Props = $props();
</script>

{#if variant === 'simple'}
	<p class="empty-simple">{message}</p>
{:else}
	<div class="empty-box">{message}</div>
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
</style>
