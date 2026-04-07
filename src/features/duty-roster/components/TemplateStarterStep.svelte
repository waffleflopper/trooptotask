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
	<div class="section-header">
		<div>
			<p class="eyebrow">Advanced Setup</p>
			<h3>Choose a starting point.</h3>
			<p class="builder-copy">
				Start from a common Army-style preset or build from a blank policy, then pick how much detail you want to work
				through right now.
			</p>
		</div>
	</div>

	<div class="setup-mode-toggle" role="group" aria-label="Setup mode">
		<button
			class="mode-chip"
			class:active={setupMode === 'quick'}
			type="button"
			aria-pressed={setupMode === 'quick'}
			onclick={() => onSetupModeChange('quick')}
		>
			Quick Setup
		</button>
		<button
			class="mode-chip"
			class:active={setupMode === 'full'}
			type="button"
			aria-pressed={setupMode === 'full'}
			onclick={() => onSetupModeChange('full')}
		>
			Full Configuration
		</button>
	</div>

	<div class="starter-grid">
		{#each presets as preset (preset.id)}
			<button class="starter-option" type="button" onclick={() => onApplyPreset(preset.id)}>
				<strong>Use {preset.label} Preset</strong>
				<span>{preset.description}</span>
			</button>
		{/each}
		<button class="starter-option" type="button" onclick={() => onApplyPreset(null)}>
			<strong>Build from Blank</strong>
			<span>Start with an empty advanced duty and shape the policy around your local SOP.</span>
		</button>
	</div>

	<p class="field-hint">
		Quick setup keeps the form to the essentials. Full configuration unlocks slot filters, preferred groups, and manual
		rotation starting points.
	</p>
</section>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.section-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	h3 {
		margin: 0;
	}
	.builder-copy {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	.setup-mode-toggle {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
		flex-wrap: wrap;
	}
	.mode-chip,
	.starter-option {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.mode-chip {
		padding: var(--sp-2) var(--sp-3);
	}
	.mode-chip.active {
		background: color-mix(in srgb, var(--amber-light) 28%, var(--surface-panel));
		border-color: color-mix(in srgb, var(--amber) 40%, var(--border-default));
	}
	.starter-grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		margin-top: var(--sp-4);
	}
	.starter-option {
		display: grid;
		gap: var(--sp-2);
		text-align: left;
		padding: var(--sp-4);
	}
	.field-hint {
		margin: var(--sp-3) 0 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
</style>
