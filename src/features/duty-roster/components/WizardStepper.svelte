<script lang="ts">
	interface Step {
		id: string;
		label: string;
	}

	interface Props {
		steps: Step[];
		current: string;
	}

	let { steps, current }: Props = $props();

	const currentIndex = $derived(steps.findIndex((step) => step.id === current));
</script>

<nav class="stepper" aria-label="Wizard progress">
	<ol class="step-list">
		{#each steps as step, index (step.id)}
			{@const isDone = index < currentIndex}
			{@const isActive = step.id === current}
			<li class="step-item" class:done={isDone} class:active={isActive}>
				<span class="step-marker" aria-hidden="true">
					{#if isDone}
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path
								d="M2 6l3 3 5-5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						{index + 1}
					{/if}
				</span>
				<span class="step-label" aria-current={isActive ? 'step' : undefined}>{step.label}</span>
				{#if index < steps.length - 1}
					<span class="step-connector" aria-hidden="true"></span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.stepper {
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
	}

	.step-list {
		display: flex;
		align-items: center;
		gap: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-x: auto;
	}

	.step-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
		color: var(--text-tertiary);
	}

	.step-item.done {
		color: var(--text-secondary);
	}

	.step-item.active {
		color: var(--text-primary);
	}

	.step-marker {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid currentColor;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		flex-shrink: 0;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.step-item.done .step-marker {
		background: var(--text-secondary);
		color: var(--surface-panel);
		border-color: var(--text-secondary);
	}

	.step-item.active .step-marker {
		background: var(--text-primary);
		color: var(--surface-panel);
		border-color: var(--text-primary);
	}

	.step-label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}

	.step-connector {
		display: block;
		width: 32px;
		height: 1px;
		background: var(--border-default);
		margin: 0 var(--sp-2);
		flex-shrink: 0;
	}
</style>
