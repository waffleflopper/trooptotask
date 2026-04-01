<script lang="ts">
	interface Props {
		appliesToRoles: string[];
		appliesToMos: string[];
		appliesToRanks: string[];
		excludedRoles: string[];
		excludedMos: string[];
		excludedRanks: string[];
		isOptional: boolean;
		availableRoles: string[];
		availableMos: string[];
		availableRanks: string[];
		onchange: (fields: ApplicabilityFields) => void;
	}

	export interface ApplicabilityFields {
		appliesToRoles: string[];
		appliesToMos: string[];
		appliesToRanks: string[];
		excludedRoles: string[];
		excludedMos: string[];
		excludedRanks: string[];
		isOptional: boolean;
	}

	let {
		appliesToRoles,
		appliesToMos,
		appliesToRanks,
		excludedRoles,
		excludedMos,
		excludedRanks,
		isOptional,
		availableRoles,
		availableMos,
		availableRanks,
		onchange
	}: Props = $props();

	let showExclusions = $state(false);

	// Initialize exclusions panel if any exclusions exist
	$effect(() => {
		if (excludedRoles.length > 0 || excludedMos.length > 0 || excludedRanks.length > 0) {
			showExclusions = true;
		}
	});

	const hasAppliesTo = $derived(appliesToRoles.length > 0 || appliesToMos.length > 0 || appliesToRanks.length > 0);

	type PresetMode = 'everyone' | 'optional' | 'custom';
	const currentMode = $derived<PresetMode>(isOptional ? 'optional' : hasAppliesTo ? 'custom' : 'everyone');

	function applyPreset(mode: PresetMode) {
		const cleared: ApplicabilityFields = {
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRoles: [],
			excludedMos: [],
			excludedRanks: [],
			isOptional: false
		};
		if (mode === 'optional') {
			cleared.isOptional = true;
		}
		onchange(cleared);
	}

	function toggleChip(field: keyof Omit<ApplicabilityFields, 'isOptional'>, value: string, currentValues: string[]) {
		const updated = currentValues.includes(value)
			? currentValues.filter((v) => v !== value)
			: [...currentValues, value];

		onchange({
			appliesToRoles,
			appliesToMos,
			appliesToRanks,
			excludedRoles,
			excludedMos,
			excludedRanks,
			isOptional: false,
			[field]: updated
		});
	}
</script>

<div class="applicability-editor">
	<div class="section-heading">Applicability</div>

	<!-- Presets -->
	<div class="preset-row">
		<button
			class="preset-btn"
			class:active={currentMode === 'everyone'}
			type="button"
			onclick={() => applyPreset('everyone')}
		>
			Everyone
		</button>
		<button
			class="preset-btn"
			class:active={currentMode === 'optional'}
			type="button"
			onclick={() => applyPreset('optional')}
		>
			Optional
		</button>
		<button class="preset-btn" class:active={currentMode === 'custom'} type="button" disabled>Custom</button>
	</div>

	{#if isOptional}
		<p class="hint">
			Tracked but not required — people without records show N/A, people with records show their status.
		</p>
	{/if}

	<!-- Applies To -->
	{#if !isOptional}
		<div class="applicability-group">
			<span class="group-label">Applies to</span>
			{#if !hasAppliesTo}
				<p class="hint">
					Everyone{excludedRoles.length + excludedMos.length + excludedRanks.length > 0 ? ' (minus exclusions)' : ''}
				</p>
			{/if}

			{#if availableRoles.length > 0}
				<div class="dimension">
					<span class="dimension-label">Roles</span>
					<div class="chip-selector">
						{#each availableRoles as role (role)}
							<button
								class="chip"
								class:active={appliesToRoles.includes(role)}
								type="button"
								onclick={() => toggleChip('appliesToRoles', role, appliesToRoles)}>{role}</button
							>
						{/each}
					</div>
				</div>
			{/if}

			{#if availableMos.length > 0}
				<div class="dimension">
					<span class="dimension-label">MOS</span>
					<div class="chip-selector">
						{#each availableMos as mos (mos)}
							<button
								class="chip"
								class:active={appliesToMos.includes(mos)}
								type="button"
								onclick={() => toggleChip('appliesToMos', mos, appliesToMos)}>{mos}</button
							>
						{/each}
					</div>
				</div>
			{/if}

			{#if availableRanks.length > 0}
				<div class="dimension">
					<span class="dimension-label">Ranks</span>
					<div class="chip-selector">
						{#each availableRanks as rank (rank)}
							<button
								class="chip"
								class:active={appliesToRanks.includes(rank)}
								type="button"
								onclick={() => toggleChip('appliesToRanks', rank, appliesToRanks)}>{rank}</button
							>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Exclusions -->
		<div class="exclusions">
			<button class="exclusion-toggle" type="button" onclick={() => (showExclusions = !showExclusions)}>
				<span class="toggle-icon">{showExclusions ? '▾' : '▸'}</span>
				<span class="toggle-label">Exclude specific roles, MOS, or ranks</span>
				{#if !showExclusions && excludedRoles.length + excludedMos.length + excludedRanks.length > 0}
					<span class="exclusion-count"
						>{excludedRoles.length + excludedMos.length + excludedRanks.length} excluded</span
					>
				{/if}
			</button>

			{#if showExclusions}
				<div class="exclusion-content">
					{#if availableRoles.length > 0}
						<div class="dimension">
							<span class="dimension-label">Roles</span>
							<div class="chip-selector">
								{#each availableRoles as role (role)}
									<button
										class="chip chip-exclude"
										class:active={excludedRoles.includes(role)}
										type="button"
										onclick={() => toggleChip('excludedRoles', role, excludedRoles)}>{role}</button
									>
								{/each}
							</div>
						</div>
					{/if}

					{#if availableMos.length > 0}
						<div class="dimension">
							<span class="dimension-label">MOS</span>
							<div class="chip-selector">
								{#each availableMos as mos (mos)}
									<button
										class="chip chip-exclude"
										class:active={excludedMos.includes(mos)}
										type="button"
										onclick={() => toggleChip('excludedMos', mos, excludedMos)}>{mos}</button
									>
								{/each}
							</div>
						</div>
					{/if}

					{#if availableRanks.length > 0}
						<div class="dimension">
							<span class="dimension-label">Ranks</span>
							<div class="chip-selector">
								{#each availableRanks as rank (rank)}
									<button
										class="chip chip-exclude"
										class:active={excludedRanks.includes(rank)}
										type="button"
										onclick={() => toggleChip('excludedRanks', rank, excludedRanks)}>{rank}</button
									>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.applicability-editor {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-heading {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
	}

	.preset-btn {
		padding: var(--sp-2) var(--sp-4);
		border: var(--border-thin);
		border-radius: 0;
		background: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
		margin-left: -1px;
	}

	.preset-btn:first-child {
		margin-left: 0;
		border-top-left-radius: var(--radius-sm);
		border-bottom-left-radius: var(--radius-sm);
	}

	.preset-btn:last-child {
		border-top-right-radius: var(--radius-sm);
		border-bottom-right-radius: var(--radius-sm);
	}

	.preset-btn:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text-primary);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
	}

	.preset-btn.active {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 30%, var(--border-default));
	}

	.preset-btn:disabled {
		opacity: 1;
		cursor: default;
	}

	.chip-selector {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.chip:hover:not(:disabled) {
		border-color: var(--border-strong);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.chip.active {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 30%, var(--border-default));
	}

	.chip:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.chip-exclude.active {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 30%, var(--border-default));
	}

	.group-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		line-height: 1.5;
		margin: var(--sp-2) 0 0;
	}

	.dimension {
		margin-top: var(--sp-3);
	}

	.dimension-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin-bottom: var(--sp-2);
		display: block;
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.exclusions {
		border-top: var(--border-thin);
		padding-top: var(--sp-4);
	}

	.exclusion-toggle {
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: var(--sp-3) var(--sp-4);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.exclusion-toggle:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}

	.toggle-icon {
		font-size: var(--text-xs);
	}

	.toggle-label {
		flex: 1;
		text-align: left;
	}

	.exclusion-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--danger);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.exclusion-content {
		margin-top: var(--sp-3);
	}
</style>
