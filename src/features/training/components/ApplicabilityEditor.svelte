<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as TypeWorkspace from '$lib/components/ui/type-workspace';

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
	const showExclusions = $derived(exclusionCount > 0);

	type PresetMode = 'everyone' | 'optional' | 'custom';
	let targetingIntent = $state(false);
	const currentMode = $derived<PresetMode>(
		isOptional ? 'optional' : hasAppliesTo || targetingIntent ? 'custom' : 'everyone'
	);

	function applyPreset(mode: PresetMode) {
		if (mode === 'custom') {
			targetingIntent = true;
			onchange({
				appliesToRoles,
				appliesToMos,
				appliesToRanks,
				excludedRoles,
				excludedMos,
				excludedRanks,
				isOptional: false
			});
			return;
		}

		targetingIntent = false;
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

	function updateSelection(field: keyof Omit<ApplicabilityFields, 'isOptional'>, updated: string[]) {
		targetingIntent = true;
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
	<TypeWorkspace.GroupSelector
		title={label}
		{values}
		{selected}
		tone={exclude ? 'danger' : 'default'}
		emptyMessage={`No ${label.toLowerCase()} found in current personnel records.`}
		onchange={(updated) => updateSelection(field, updated)}
	/>
{/snippet}

<TypeWorkspace.Form title="Applicability">
	<TypeWorkspace.Description>
		Start with the broad policy, then open targeting only when this type applies to a subset.
	</TypeWorkspace.Description>

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
		<Button
			type="button"
			variant={currentMode === 'custom' ? 'secondary' : 'outline'}
			aria-pressed={currentMode === 'custom'}
			onclick={() => applyPreset('custom')}
		>
			Targeted
		</Button>
	</ButtonGroup.Root>

	{#if isOptional}
		<Alert.Root variant="info">
			<Alert.Description>
				Tracked but not required. People without records show N/A, people with records show their status.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !isOptional}
		<TypeWorkspace.Disclosure
			title="Targeting"
			description="Limit this type by role, MOS, or rank only when everyone is too broad."
			open={currentMode === 'custom'}
		>
			{#if !hasAppliesTo}
				<Badge variant="outline">Choose at least one role, MOS, or rank.</Badge>
			{/if}

			{@render dimension('Roles', availableRoles, appliesToRoles, 'appliesToRoles')}
			{@render dimension('MOS', availableMos, appliesToMos, 'appliesToMos')}
			{@render dimension('Ranks', availableRanks, appliesToRanks, 'appliesToRanks')}
		</TypeWorkspace.Disclosure>

		<TypeWorkspace.Disclosure
			title="Exclusions"
			description="Remove specific groups from an otherwise broad requirement."
			open={showExclusions}
		>
			{@render dimension('Excluded roles', availableRoles, excludedRoles, 'excludedRoles', true)}
			{@render dimension('Excluded MOS', availableMos, excludedMos, 'excludedMos', true)}
			{@render dimension('Excluded ranks', availableRanks, excludedRanks, 'excludedRanks', true)}
		</TypeWorkspace.Disclosure>
	{/if}
</TypeWorkspace.Form>
