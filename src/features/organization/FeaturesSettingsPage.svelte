<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as DraftField from '$lib/components/patterns/draft-field';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import type { FeatureKey } from '$lib/access/featureSwitches';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		FEATURE_ROWS,
		availabilityHolds,
		holdsLane,
		lossWindowHolds,
		strengthFloorSentence,
		type FeatureCounts,
		type FeatureRow,
		type HoldsLane,
		type FeaturesSettingsData
	} from './featuresSettings';
	import { saveOrganizationSettings } from './saveOrganizationSettings';

	let {
		orgUrlSegment,
		unitName,
		features
	}: { orgUrlSegment: string; unitName: string; features: FeaturesSettingsData } = $props();

	const counts = new StreamedValue(() => features.counts);

	const saveSettings = (body: Record<string, unknown>) => saveOrganizationSettings(orgUrlSegment, body);

	/** The state each switch is saving toward; a switch shows it until the refreshed organization row agrees. */
	let pending = $state<Partial<Record<FeatureKey, boolean>>>({});
	// One save at a time, so each change applies to the set the previous one stored.
	let saves = Promise.resolve();

	const isOn = (key: FeatureKey) => pending[key] ?? !features.disabledFeatures.includes(key);

	function setFeature(row: FeatureRow, on: boolean) {
		if (pending[row.key] !== undefined) return;
		pending[row.key] = on;
		saves = saves.then(async () => {
			try {
				await saveSettings({ featureSwitch: { feature: row.key, on } });
				// The sidebar and the dashboard read the switches from the organization row the layout loads.
				await invalidate('app:org-core');
				toastStore.success(
					on ? `${row.label} is on for ${unitName}.` : `${row.label} is off for ${unitName}. Its records are kept.`
				);
			} catch (error) {
				toastStore.error(`Couldn't turn ${row.label} ${on ? 'on' : 'off'}. ${(error as Error).message}`);
			} finally {
				delete pending[row.key];
			}
		});
	}

	const floor = new DraftField.FieldDraft<number | null>(() => features.strengthFloorPercent);
	const floorValid = $derived(
		floor.value !== null && Number.isInteger(floor.value) && floor.value >= 1 && floor.value <= 100
	);

	async function saveFloor(value: number | null) {
		// JSON drops an undefined key, and the server answers a missing key with the generic error, not the floor's.
		await saveSettings({ strengthFloorPercent: value ?? null });
		toastStore.success(`Strength floor saved at ${value}%.`);
	}
</script>

{#snippet lane(read: (counts: FeatureCounts) => HoldsLane)}
	{#if counts.current.state === 'ready'}
		{@const holds = read(counts.current.value)}
		<span class={holds.notSetUp ? 'font-semibold text-warning-foreground' : undefined}>{holds.text}</span>
	{:else if counts.current.state === 'failed'}
		<span>Counts unavailable</span>
	{:else}
		<Skeleton class="my-[3px] h-3.5 w-32" aria-hidden="true" />
		<span class="sr-only">Loading counts</span>
	{/if}
{/snippet}

<PageShell.FactSection endRule>
	<PageShell.FactRow
		variant="display"
		label="Availability and calendar"
		description="Statuses, assignments and the calendar. Drives strength and availability on the dashboard. Always on."
	>
		{#snippet holds()}
			{@render lane((value) => ({ text: availabilityHolds(value), notSetUp: false }))}
		{/snippet}
		{#snippet control()}
			<span class="pt-0.5 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
				Always
			</span>
		{/snippet}
		{#snippet details()}
			<DraftField.Root draft={floor} id="strength-floor" name="strength floor" was="{floor.saved}%" save={saveFloor}>
				{#snippet field(aria)}
					<Field.Label for="strength-floor" class="text-sm font-semibold">Strength floor</Field.Label>
					<InputGroup.Root class="w-24 bg-background">
						<InputGroup.Input
							id="strength-floor"
							type="number"
							inputmode="numeric"
							min="1"
							max="100"
							step="1"
							class="text-center font-mono font-semibold"
							bind:value={floor.value}
							{...aria}
						/>
						<InputGroup.Addon align="inline-end" variant="muted"><InputGroup.Text>%</InputGroup.Text></InputGroup.Addon>
					</InputGroup.Root>
				{/snippet}
				Groups under this line turn amber on the dashboard.
				{#if floorValid && floor.value !== null && counts.current.state === 'ready'}
					{strengthFloorSentence(floor.value, counts.current.value.activePersonnel)}
				{:else if floorValid && counts.current.state === 'pending'}
					<Skeleton class="inline-block h-3.5 w-56 bg-foreground/10 align-middle" aria-hidden="true" />
				{/if}
			</DraftField.Root>
		{/snippet}
	</PageShell.FactRow>

	{#each FEATURE_ROWS as feature (feature.key)}
		{@const on = isOn(feature.key)}
		<PageShell.FactRow
			variant="display"
			label={feature.label}
			labelFor="feature-{feature.key}"
			description={on ? feature.description : feature.offDescription}
			muted={!on}
		>
			{#snippet holds()}
				{#if feature.holds}
					{@const read = feature.holds}
					{@render lane((value) => holdsLane(read(value), on))}
				{:else}
					{lossWindowHolds(features.lossWarningWindowDays)}
				{/if}
			{/snippet}
			{#snippet control()}
				<Switch
					id="feature-{feature.key}"
					bind:checked={() => on, (next) => setFeature(feature, next)}
					aria-describedby="feature-{feature.key}-description"
					aria-disabled={pending[feature.key] !== undefined || undefined}
					aria-busy={pending[feature.key] !== undefined || undefined}
				/>
			{/snippet}
		</PageShell.FactRow>
	{/each}
</PageShell.FactSection>
