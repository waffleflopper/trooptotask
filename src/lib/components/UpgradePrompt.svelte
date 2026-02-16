<script lang="ts">
	interface Props {
		featureName: string;
		requiredPlan?: string;
		compact?: boolean;
	}

	let { featureName, requiredPlan = 'Pro', compact = false }: Props = $props();
</script>

{#if compact}
	<div class="upgrade-prompt compact">
		<span class="lock-icon">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
			</svg>
		</span>
		<span class="text">{requiredPlan} feature</span>
		<a href="/billing/upgrade" class="upgrade-link">Upgrade</a>
	</div>
{:else}
	<div class="upgrade-prompt">
		<div class="lock-container">
			<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
			</svg>
		</div>
		<h3 class="title">{featureName}</h3>
		<p class="description">
			This feature requires a {requiredPlan} subscription or higher.
		</p>
		<a href="/billing/upgrade" class="upgrade-button">
			Upgrade to {requiredPlan}
		</a>
	</div>
{/if}

<style>
	.upgrade-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		background: var(--color-surface);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg);
		text-align: center;
		min-height: 200px;
	}

	.upgrade-prompt.compact {
		flex-direction: row;
		min-height: auto;
		padding: var(--spacing-sm) var(--spacing-md);
		gap: var(--spacing-sm);
		border-width: 1px;
		border-style: solid;
		background: var(--color-warning-bg, #fef3c7);
		border-color: var(--color-warning-border, #fcd34d);
	}

	.lock-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: var(--color-primary-bg, #eff6ff);
		border-radius: 50%;
		color: var(--color-primary, #3b82f6);
		margin-bottom: var(--spacing-md);
	}

	.lock-icon {
		display: flex;
		color: var(--color-warning-text, #92400e);
	}

	.title {
		margin: 0 0 var(--spacing-sm) 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
	}

	.description {
		margin: 0 0 var(--spacing-lg) 0;
		color: var(--color-text-muted);
		max-width: 300px;
	}

	.text {
		color: var(--color-warning-text, #92400e);
		font-size: var(--font-size-sm);
	}

	.upgrade-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-primary, #3b82f6);
		color: white;
		font-weight: 500;
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: background 0.15s;
	}

	.upgrade-button:hover {
		background: var(--color-primary-hover, #2563eb);
	}

	.upgrade-link {
		color: var(--color-primary, #3b82f6);
		font-weight: 500;
		font-size: var(--font-size-sm);
		text-decoration: none;
	}

	.upgrade-link:hover {
		text-decoration: underline;
	}
</style>
