<script lang="ts">
	interface Props {
		appliesToRoles: string[];
		appliesToMos: string[];
		appliesToRanks: string[];
		excludedRoles: string[];
		excludedMos: string[];
		excludedRanks: string[];
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
	}

	let {
		appliesToRoles,
		appliesToMos,
		appliesToRanks,
		excludedRoles,
		excludedMos,
		excludedRanks,
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

	function toggleChip(field: keyof ApplicabilityFields, value: string, currentValues: string[]) {
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
			[field]: updated
		});
	}
</script>

<fieldset class="editor-section">
	<legend class="section-title">Applicability</legend>

	<!-- Applies To -->
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
</fieldset>

<style>
	.applicability-group {
		margin-bottom: 0.75rem;
	}

	.group-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.dimension {
		margin-top: 0.5rem;
	}

	.dimension-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
		display: block;
	}

	.exclusions {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.exclusion-toggle {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.25rem 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.exclusion-toggle:hover {
		color: var(--text-primary);
	}

	.exclusion-count {
		color: var(--color-warning);
		font-weight: 600;
	}

	.exclusion-content {
		margin-top: 0.5rem;
	}

	.chip-exclude.active {
		background: var(--color-danger, #ef4444);
		color: white;
		border-color: var(--color-danger, #ef4444);
	}
</style>
