<script lang="ts" module>
	export type PolicyKey = 'retention' | 'warning' | 'goal';
</script>

<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	let {
		retentionMonths = $bindable(0),
		warningWindowDays = $bindable(0),
		readinessGoalPercent = $bindable(0),
		hasRetentionChanges,
		isRetentionValid,
		hasLossWarningChanges,
		isLossWarningValid,
		hasReadinessGoalChanges,
		isReadinessGoalValid,
		savingRetention,
		savingWarningWindow,
		savingReadinessGoal,
		saveErrors = {},
		onSaveRetention,
		onSaveLossWarning,
		onSaveReadinessGoal
	}: {
		retentionMonths?: number;
		warningWindowDays?: number;
		readinessGoalPercent?: number | null;
		hasRetentionChanges: boolean;
		isRetentionValid: boolean;
		hasLossWarningChanges: boolean;
		isLossWarningValid: boolean;
		hasReadinessGoalChanges: boolean;
		isReadinessGoalValid: boolean;
		savingRetention: boolean;
		savingWarningWindow: boolean;
		savingReadinessGoal: boolean;
		saveErrors?: Partial<Record<PolicyKey, string>>;
		onSaveRetention: () => void;
		onSaveLossWarning: () => void;
		onSaveReadinessGoal: () => void;
	} = $props();

	/** Explicit IDs associate the help and error in server-rendered HTML, before Field registration runs. */
	function describedBy(...ids: (string | false)[]) {
		return ids.filter(Boolean).join(' ') || undefined;
	}
</script>

{#snippet sectionHeader(
	headingId: string,
	heading: string,
	description: string | null,
	changed: boolean,
	saveDisabled: boolean,
	saving: boolean,
	onSave: () => void
)}
	<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
		<div class="grid gap-1">
			<h2 id={headingId} class="font-heading text-lg font-semibold tracking-tight">{heading}</h2>
			{#if description}<p class="text-sm text-muted-foreground">{description}</p>{/if}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant={changed ? 'outline' : 'secondary'}>{changed ? 'Unsaved changes' : 'Saved'}</Badge>
			<Button size="sm" disabled={saveDisabled || saving} onclick={onSave}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Save'} <span class="sr-only">{heading}</span>
			</Button>
		</div>
	</div>
{/snippet}

{#snippet saveError(message: string | undefined)}
	{#if message}
		<Alert.Root variant="destructive">
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}
{/snippet}

<div class="grid gap-4">
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="archive-retention-heading"
	>
		{@render sectionHeader(
			'archive-retention-heading',
			'Archive Retention',
			'Archived personnel are automatically purged after this window.',
			hasRetentionChanges,
			!hasRetentionChanges || !isRetentionValid,
			savingRetention,
			onSaveRetention
		)}
		<Separator />
		{@render saveError(saveErrors.retention)}
		<Field.Root class="md:max-w-sm" data-invalid={isRetentionValid ? undefined : true}>
			<Field.Label for="retention-months">Retention period (months)</Field.Label>
			<Field.Control>
				<Input
					id="retention-months"
					type="number"
					min="1"
					max="120"
					bind:value={retentionMonths}
					aria-invalid={isRetentionValid ? undefined : true}
					aria-describedby={describedBy(!isRetentionValid && 'retention-months-error')}
				/>
			</Field.Control>
			{#if !isRetentionValid}
				<Field.Error id="retention-months-error">Must be between 1 and 120 months.</Field.Error>
			{/if}
		</Field.Root>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="loss-warning-heading">
		{@render sectionHeader(
			'loss-warning-heading',
			'Loss Warning Window',
			'Flag personnel approaching ETS / PCS / DEROS this far out.',
			hasLossWarningChanges,
			!hasLossWarningChanges || !isLossWarningValid,
			savingWarningWindow,
			onSaveLossWarning
		)}
		<Separator />
		{@render saveError(saveErrors.warning)}
		<Field.Root class="md:max-w-sm" data-invalid={isLossWarningValid ? undefined : true}>
			<Field.Label for="loss-warning-window">Warning lead time (days)</Field.Label>
			<Field.Control>
				<Input
					id="loss-warning-window"
					type="number"
					min="1"
					max="365"
					bind:value={warningWindowDays}
					aria-invalid={isLossWarningValid ? undefined : true}
					aria-describedby={describedBy(!isLossWarningValid && 'loss-warning-window-error')}
				/>
			</Field.Control>
			{#if !isLossWarningValid}
				<Field.Error id="loss-warning-window-error">Must be between 1 and 365 days.</Field.Error>
			{/if}
		</Field.Root>
	</section>

	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="training-readiness-heading"
	>
		{@render sectionHeader(
			'training-readiness-heading',
			'Training Readiness',
			null,
			hasReadinessGoalChanges,
			!hasReadinessGoalChanges || !isReadinessGoalValid,
			savingReadinessGoal,
			onSaveReadinessGoal
		)}
		<Separator />
		{@render saveError(saveErrors.goal)}
		<Field.Root class="md:max-w-sm" data-invalid={isReadinessGoalValid ? undefined : true}>
			<Field.Label for="training-readiness-goal">Training readiness goal (%)</Field.Label>
			<Field.Control>
				<Input
					id="training-readiness-goal"
					type="number"
					min="1"
					max="100"
					step="1"
					bind:value={readinessGoalPercent}
					aria-invalid={isReadinessGoalValid ? undefined : true}
					aria-describedby={describedBy(
						'training-readiness-goal-help',
						!isReadinessGoalValid && 'training-readiness-goal-error'
					)}
				/>
			</Field.Control>
			<Field.Description id="training-readiness-goal-help">
				Used for goal lines and heat-map bands on Training Reports.
			</Field.Description>
			{#if !isReadinessGoalValid}
				<Field.Error id="training-readiness-goal-error">Must be a whole number between 1 and 100.</Field.Error>
			{/if}
		</Field.Root>
	</section>
</div>
