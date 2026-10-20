<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
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

	let {
		orgUrlSegment,
		unitName,
		features
	}: { orgUrlSegment: string; unitName: string; features: FeaturesSettingsData } = $props();

	const counts = new StreamedValue(() => features.counts);

	async function saveSettings(body: Record<string, unknown>) {
		const response = await fetch(`/org/${orgUrlSegment}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (response.ok) return;
		const failure: { message?: unknown } | null = await response.json().catch(() => null);
		throw new Error(typeof failure?.message === 'string' ? failure.message : 'Try again.');
	}

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

	let savedFloor = $derived(features.strengthFloorPercent);
	let floorDraft = $derived<number | null>(savedFloor);
	let floorError = $state<string | null>(null);
	let savingFloor = $state(false);
	const floorChanged = $derived(floorDraft !== savedFloor);
	const floorValid = $derived(
		floorDraft !== null && Number.isInteger(floorDraft) && floorDraft >= 1 && floorDraft <= 100
	);

	async function saveFloor(event: SubmitEvent) {
		event.preventDefault();
		if (!floorChanged || savingFloor) return;
		const submitted = floorDraft;
		savingFloor = true;
		floorError = null;
		try {
			await saveSettings({ strengthFloorPercent: submitted });
			savedFloor = submitted ?? savedFloor;
			toastStore.success(`Strength floor saved at ${submitted}%.`);
		} catch (error) {
			floorError = (error as Error).message;
		} finally {
			savingFloor = false;
		}
	}

	function undoFloor() {
		floorDraft = savedFloor;
		floorError = null;
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

{#snippet row(
	id: string,
	label: string,
	description: string,
	muted: boolean,
	holds: import('svelte').Snippet,
	control: import('svelte').Snippet
)}
	<div
		class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_11.25rem_4rem] md:items-start"
	>
		<div class="grid gap-1">
			<h2 id="{id}-title" class="font-heading text-[22px] leading-6 font-bold {muted ? 'text-muted-foreground' : ''}">
				{label}
			</h2>
			<p id="{id}-description" class="text-sm text-foreground">{description}</p>
		</div>
		<div class="col-start-1 font-mono text-xs leading-5 text-muted-foreground md:col-start-2 md:row-start-1">
			{@render holds()}
		</div>
		<div class="col-start-2 row-start-1 flex justify-end pt-px md:col-start-3">
			{@render control()}
		</div>
	</div>
{/snippet}

<div class="border-t-2 border-foreground">
	<section class="grid gap-3.5 border-b border-border py-5" aria-labelledby="availability-title">
		{#snippet availabilityHoldsLane()}
			{@render lane((value) => ({ text: availabilityHolds(value), notSetUp: false }))}
		{/snippet}
		{#snippet always()}
			<span class="pt-0.5 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
				Always
			</span>
		{/snippet}
		{@render row(
			'availability',
			'Availability and calendar',
			'Statuses, assignments and the calendar. Drives strength and availability on the dashboard. Always on.',
			false,
			availabilityHoldsLane,
			always
		)}
		<form
			class="grid gap-x-3 gap-y-2 rounded-sm border border-border bg-muted px-3.5 py-3 md:grid-cols-[auto_auto_minmax(0,1fr)] md:items-center"
			novalidate
			onsubmit={saveFloor}
		>
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
					bind:value={floorDraft}
					aria-invalid={floorError ? true : undefined}
					aria-describedby="strength-floor-sentence{floorError ? ' strength-floor-error' : ''}"
				/>
				<InputGroup.Addon align="inline-end"><InputGroup.Text>%</InputGroup.Text></InputGroup.Addon>
			</InputGroup.Root>
			<p id="strength-floor-sentence" class="text-sm text-foreground">
				Groups under this line turn amber on the dashboard.
				{#if floorValid && floorDraft !== null && counts.current.state === 'ready'}
					{strengthFloorSentence(floorDraft, counts.current.value.activePersonnel)}
				{:else if floorValid && counts.current.state === 'pending'}
					<Skeleton class="inline-block h-3.5 w-56 bg-foreground/10 align-middle" aria-hidden="true" />
				{/if}
			</p>
			{#if floorChanged || floorError}
				<div class="flex flex-wrap items-center gap-2 md:col-span-3">
					{#if floorChanged}
						<span class="font-mono text-xs font-semibold text-warning-foreground">Unsaved · was {savedFloor}%</span>
						<!-- aria-disabled keeps focus on Save while it saves. -->
						<Button
							type="submit"
							size="sm"
							aria-disabled={savingFloor || undefined}
							aria-busy={savingFloor || undefined}
						>
							{#if savingFloor}<Spinner />{/if}
							{savingFloor ? 'Saving...' : 'Save'} <span class="sr-only">strength floor</span>
						</Button>
						<Button type="button" size="sm" variant="ghost" onclick={undoFloor} disabled={savingFloor}>
							Undo <span class="sr-only">strength floor change</span>
						</Button>
					{/if}
					{#if floorError}
						<Field.Error id="strength-floor-error" class="basis-full">{floorError}</Field.Error>
					{/if}
				</div>
			{/if}
		</form>
	</section>

	{#each FEATURE_ROWS as feature (feature.key)}
		{@const on = isOn(feature.key)}
		<section class="border-b border-border py-5" aria-labelledby="{feature.key}-title">
			{#snippet featureHolds()}
				{#if feature.holds}
					{@const holds = feature.holds}
					{@render lane((value) => holdsLane(holds(value), on))}
				{:else}
					{lossWindowHolds(features.lossWarningWindowDays)}
				{/if}
			{/snippet}
			{#snippet featureSwitch()}
				<Switch
					bind:checked={() => on, (next) => setFeature(feature, next)}
					aria-labelledby="{feature.key}-title"
					aria-describedby="{feature.key}-description"
					aria-disabled={pending[feature.key] !== undefined || undefined}
					aria-busy={pending[feature.key] !== undefined || undefined}
				/>
			{/snippet}
			{@render row(
				feature.key,
				feature.label,
				on ? feature.description : feature.offDescription,
				!on,
				featureHolds,
				featureSwitch
			)}
		</section>
	{/each}
</div>
