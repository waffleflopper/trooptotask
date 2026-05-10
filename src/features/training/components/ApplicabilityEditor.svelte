<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as Field from '$lib/components/ui/field';

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

	const hasAppliesTo = $derived(appliesToRoles.length > 0 || appliesToMos.length > 0 || appliesToRanks.length > 0);
	const exclusionCount = $derived(excludedRoles.length + excludedMos.length + excludedRanks.length);
	let exclusionsExpandedOverride = $state<boolean | null>(null);
	const showExclusions = $derived(exclusionsExpandedOverride ?? exclusionCount > 0);

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

{#snippet dimension(
	label: string,
	values: string[],
	selected: string[],
	field: keyof Omit<ApplicabilityFields, 'isOptional'>,
	exclude = false
)}
	{#if values.length > 0}
		<Field.Root>
			<Field.Label>{label}</Field.Label>
			<div class="flex flex-wrap gap-2">
				{#each values as value (value)}
					<Button
						type="button"
						size="sm"
						variant={selected.includes(value) ? (exclude ? 'destructive' : 'secondary') : 'outline'}
						aria-pressed={selected.includes(value)}
						onclick={() => toggleChip(field, value, selected)}
					>
						{value}
					</Button>
				{/each}
			</div>
		</Field.Root>
	{/if}
{/snippet}

<section class="grid gap-4 rounded-lg border border-border bg-card p-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Applicability</h3>
		<ButtonGroup.Root aria-label="Applicability preset">
			<Button
				type="button"
				variant={currentMode === 'everyone' ? 'secondary' : 'outline'}
				aria-pressed={currentMode === 'everyone'}
				onclick={() => applyPreset('everyone')}
			>
				Everyone
			</Button>
			<Button
				type="button"
				variant={currentMode === 'optional' ? 'secondary' : 'outline'}
				aria-pressed={currentMode === 'optional'}
				onclick={() => applyPreset('optional')}
			>
				Optional
			</Button>
			<Button type="button" variant={currentMode === 'custom' ? 'secondary' : 'outline'} disabled>Custom</Button>
		</ButtonGroup.Root>
	</div>

	{#if isOptional}
		<Alert.Root variant="info">
			<Alert.Description>
				Tracked but not required. People without records show N/A, people with records show their status.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !isOptional}
		<div class="grid gap-4">
			<div class="grid gap-3">
				<div class="flex items-center gap-2">
					<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						Applies to
					</span>
					{#if !hasAppliesTo}
						<Badge variant="outline">
							Everyone{exclusionCount > 0 ? ' minus exclusions' : ''}
						</Badge>
					{/if}
				</div>

				{@render dimension('Roles', availableRoles, appliesToRoles, 'appliesToRoles')}
				{@render dimension('MOS', availableMos, appliesToMos, 'appliesToMos')}
				{@render dimension('Ranks', availableRanks, appliesToRanks, 'appliesToRanks')}
			</div>

			<div class="border-t border-border pt-4">
				<Button variant="outline" type="button" onclick={() => (exclusionsExpandedOverride = !showExclusions)}>
					{showExclusions ? 'Hide exclusions' : 'Exclude specific roles, MOS, or ranks'}
					{#if !showExclusions && exclusionCount > 0}
						<Badge variant="destructive">{exclusionCount} excluded</Badge>
					{/if}
				</Button>

				{#if showExclusions}
					<div class="mt-3 grid gap-3">
						{@render dimension('Excluded roles', availableRoles, excludedRoles, 'excludedRoles', true)}
						{@render dimension('Excluded MOS', availableMos, excludedMos, 'excludedMos', true)}
						{@render dimension('Excluded ranks', availableRanks, excludedRanks, 'excludedRanks', true)}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
