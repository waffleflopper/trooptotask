<script lang="ts">
	import type { SetupMode, TemplateStarterPreset } from './advancedDutyTemplateBuilder.helpers';

	interface Props {
		setupMode: SetupMode;
		presets: TemplateStarterPreset[];
		onSetupModeChange: (mode: SetupMode) => void;
		onApplyPreset: (presetId: string | null) => void;
	}

	let { setupMode, presets, onSetupModeChange, onApplyPreset }: Props = $props();
</script>

<section class="builder-card starter-card">
	<div class="starter-topline">
		<p class="eyebrow">Start From</p>
		<div class="setup-mode-toggle" role="group" aria-label="Setup mode">
			<button
				class="mode-chip"
				class:active={setupMode === 'quick'}
				type="button"
				aria-pressed={setupMode === 'quick'}
				onclick={() => onSetupModeChange('quick')}
			>
				Quick
			</button>
			<button
				class="mode-chip"
				class:active={setupMode === 'full'}
				type="button"
				aria-pressed={setupMode === 'full'}
				onclick={() => onSetupModeChange('full')}
			>
				Full
			</button>
		</div>
	</div>

	<div class="starter-list">
		{#each presets as preset (preset.id)}
			<button class="starter-option" type="button" onclick={() => onApplyPreset(preset.id)}>
				<strong>{preset.label}</strong>
			</button>
		{/each}
		<button class="starter-option" type="button" onclick={() => onApplyPreset(null)}>
			<strong>Blank</strong>
		</button>
	</div>
</section>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.starter-topline {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-4);
	}
	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.setup-mode-toggle {
		display: flex;
		gap: var(--sp-1);
		flex-wrap: wrap;
	}
	.mode-chip,
	.starter-option {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.mode-chip {
		padding: var(--sp-1) var(--sp-3);
	}
	.mode-chip.active {
		background: color-mix(in srgb, var(--amber-light) 28%, var(--surface-panel));
		border-color: color-mix(in srgb, var(--amber) 40%, var(--border-default));
	}
	.starter-list {
		display: grid;
		gap: var(--sp-2);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		margin-top: var(--sp-3);
	}
	.starter-option {
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
	}
</style>
