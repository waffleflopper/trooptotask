<script lang="ts">
	interface Props {
		stages: string[];
		currentStage: string;
		onStageClick?: (stage: string) => void;
		disabled?: boolean;
	}

	let { stages, currentStage, onStageClick, disabled = false }: Props = $props();

	function getStageStatus(stage: string): 'completed' | 'current' | 'upcoming' {
		const currentIndex = stages.indexOf(currentStage);
		const stageIndex = stages.indexOf(stage);
		if (stageIndex < currentIndex) return 'completed';
		if (stageIndex === currentIndex) return 'current';
		return 'upcoming';
	}
</script>

<div class="stepper" role="group" aria-label="Progress steps">
	{#each stages as stage, i (stage)}
		{@const status = getStageStatus(stage)}
		{#if i > 0}
			<div class="connector" class:completed={status === 'completed' || status === 'current'}></div>
		{/if}
		<button
			type="button"
			aria-current={status === 'current' ? 'step' : undefined}
			class="stage {status}"
			disabled={disabled || !onStageClick}
			onclick={() => onStageClick?.(stage)}
			title={stage}
		>
			<span class="stage-dot"></span>
			<span class="stage-label">{stage}</span>
		</button>
	{/each}
</div>

<style>
	.stepper {
		display: flex;
		align-items: center;
		gap: 0;
		width: 100%;
	}

	.connector {
		flex: 1;
		height: 2px;
		min-width: var(--sp-2);
		background-color: var(--border-default);
		transition: background-color 0.2s ease;
	}

	.connector.completed {
		background-color: var(--amber);
	}

	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
		background: none;
		border: none;
		padding: var(--sp-1);
		cursor: pointer;
		min-width: 0;
		transition: opacity 0.2s ease;
	}

	.stage:disabled {
		cursor: default;
	}

	.stage:not(:disabled):hover {
		opacity: 0.8;
	}

	.stage-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--border-default);
		background: var(--surface-panel);
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.stage.completed .stage-dot {
		background: var(--amber);
		border-color: var(--amber);
	}

	.stage.current .stage-dot {
		border-color: var(--amber);
		background: var(--amber);
		box-shadow: 0 0 0 3px rgba(var(--amber-rgb), 0.25);
	}

	.stage.upcoming .stage-dot {
		background: var(--surface-panel);
		border-color: var(--border-default);
	}

	.stage-label {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}

	.stage.current .stage-label {
		color: var(--amber);
		font-weight: 600;
	}

	.stage.completed .stage-label {
		color: var(--text-secondary);
	}
</style>
