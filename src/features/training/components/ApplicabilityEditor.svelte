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

<fieldset class="editor-section">
	<legend class="section-title">Applicability</legend>

	<!-- Presets -->
	<div class="preset-row">
		<button class="preset-btn" class:active={currentMode === 'everyone'} onclick={() => applyPreset('everyone')}>
			Everyone
		</button>
		<button class="preset-btn" class:active={currentMode === 'optional'} onclick={() => applyPreset('optional')}>
			Optional
		</button>
		<button class="preset-btn" class:active={currentMode === 'custom'} disabled> Custom </button>
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
								onclick={() => toggleChip('appliesToRanks', rank, appliesToRanks)}>{rank}</button
							>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Excluded (collapsed by default) -->
		<div class="exclusions">
			<button class="exclusion-toggle" onclick={() => (showExclusions = !showExclusions)}>
				{showExclusions ? '▾' : '▸'} Exclusions
				{#if !showExclusions && excludedRoles.length + excludedMos.length + excludedRanks.length > 0}
					<span class="exclusion-count">({excludedRoles.length + excludedMos.length + excludedRanks.length})</span>
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
</fieldset>

<style>
	/* Preset buttons */
	.preset-row {
		display: flex;
		gap: var(--spacing-xs, 0.25rem);
		margin-bottom: var(--spacing-sm, 0.5rem);
	}

	.preset-btn {
		padding: 4px 12px;
		border: 1px solid var(--color-border, #d1d5db);
		border-radius: var(--radius-md, 6px);
		background: var(--color-bg, #fff);
		font-size: var(--font-size-sm, 0.875rem);
		cursor: pointer;
		transition: all var(--transition-fast, 0.15s);
	}

	.preset-btn:hover:not(:disabled) {
		border-color: var(--color-primary, #3b82f6);
	}

	.preset-btn.active {
		background: var(--color-primary, #3b82f6);
		color: white;
		border-color: var(--color-primary, #3b82f6);
	}

	.preset-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Chip selectors */
	.chip-selector {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs, 0.25rem);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 12px;
		border: 1px solid var(--color-border, #d1d5db);
		border-radius: 999px;
		background: var(--color-bg, #fff);
		font-size: var(--font-size-sm, 0.875rem);
		cursor: pointer;
		transition: all var(--transition-fast, 0.15s);
	}

	.chip:hover:not(:disabled) {
		border-color: var(--color-primary, #3b82f6);
	}

	.chip.active {
		background: var(--color-primary, #3b82f6);
		color: white;
		border-color: var(--color-primary, #3b82f6);
	}

	.chip:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.chip-exclude.active {
		background: var(--color-danger, #ef4444);
		color: white;
		border-color: var(--color-danger, #ef4444);
	}

	/* Layout */
	.applicability-group {
		margin-bottom: 0.75rem;
	}

	.group-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary, #6b7280);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.hint {
		font-size: var(--font-size-xs, 0.75rem);
		color: var(--color-text-muted, #9ca3af);
		font-style: italic;
		margin: 0.25rem 0 0;
	}

	.dimension {
		margin-top: 0.5rem;
	}

	.dimension-label {
		font-size: 0.75rem;
		color: var(--color-text-muted, #9ca3af);
		margin-bottom: 0.25rem;
		display: block;
	}

	.exclusions {
		border-top: 1px solid var(--color-border, #d1d5db);
		padding-top: 0.5rem;
	}

	.exclusion-toggle {
		background: none;
		border: none;
		color: var(--color-text-secondary, #6b7280);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.25rem 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.exclusion-toggle:hover {
		color: var(--color-text-primary, #111);
	}

	.exclusion-count {
		color: var(--color-warning, #eab308);
		font-weight: 600;
	}

	.exclusion-content {
		margin-top: 0.5rem;
	}
</style>
