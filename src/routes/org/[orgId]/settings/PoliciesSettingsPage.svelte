<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import * as DraftField from '$lib/components/patterns/draft-field';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { FEATURE_SWITCHES } from '$lib/access/featureSwitches';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		groupsUnderGoalSentence,
		lossWindowSentence,
		retentionSentence,
		type PoliciesSettingsData
	} from './policiesSettings';
	import { saveOrganizationSettings } from '$features/organization';
	import {
		ARCHIVE_RETENTION_CONSTRAINT,
		LOSS_WARNING_CONSTRAINT,
		TRAINING_READINESS_GOAL_CONSTRAINT
	} from '$features/organization/contracts';

	let {
		orgUrlSegment,
		unitName,
		policies
	}: { orgUrlSegment: string; unitName: string; policies: PoliciesSettingsData } = $props();

	type Range = { min: number; max: number };
	type Policy = {
		key: 'lossWarningWindowDays' | 'trainingReadinessGoalPercent' | 'archiveRetentionMonths';
		id: string;
		label: string;
		description: string;
		/** Names the Save and Undo buttons. */
		name: string;
		unit: string;
		width: string;
		range: Range;
		draft: DraftField.FieldDraft<number | null>;
		was: (saved: number | null) => string;
		hint: string;
		invalid: string;
		saved: string;
	};

	let active = true;
	onDestroy(() => {
		active = false;
	});

	const now = new Date();
	const lossCandidates = new StreamedValue(() => policies.lossCandidates);
	const groupReadiness = new StreamedValue(() => policies.groupReadiness);

	const isWhole = (value: number | null, range: Range): value is number =>
		value !== null && Number.isInteger(value) && value >= range.min && value <= range.max;

	const lossWindow: Policy = {
		key: 'lossWarningWindowDays',
		id: 'loss-warning-window',
		label: 'Loss warning window',
		description: 'How far ahead ETS, PCS and DEROS dates get flagged on the dashboard and in Personnel.',
		name: 'loss warning window',
		unit: 'days',
		width: 'w-32',
		range: LOSS_WARNING_CONSTRAINT,
		draft: new DraftField.FieldDraft(() => policies.lossWarningWindowDays),
		was: (saved) => `${saved}`,
		hint: `Enter ${LOSS_WARNING_CONSTRAINT.min} to ${LOSS_WARNING_CONSTRAINT.max} days.`,
		invalid: `The loss warning window must be a whole number of days from ${LOSS_WARNING_CONSTRAINT.min} to ${LOSS_WARNING_CONSTRAINT.max}.`,
		saved: 'Warning window saved'
	};
	const readinessGoal: Policy = {
		key: 'trainingReadinessGoalPercent',
		id: 'training-readiness-goal',
		label: 'Training readiness goal',
		description: 'The goal line on Training Reports and the break between green and amber in the heat map.',
		name: 'training readiness goal',
		unit: '%',
		width: 'w-24',
		range: TRAINING_READINESS_GOAL_CONSTRAINT,
		draft: new DraftField.FieldDraft(() => policies.trainingReadinessGoalPercent),
		was: (saved) => `${saved}%`,
		hint: `Enter a whole percent from ${TRAINING_READINESS_GOAL_CONSTRAINT.min} to ${TRAINING_READINESS_GOAL_CONSTRAINT.max}.`,
		invalid: `The training readiness goal must be a whole number from ${TRAINING_READINESS_GOAL_CONSTRAINT.min} to ${TRAINING_READINESS_GOAL_CONSTRAINT.max}.`,
		saved: 'Training readiness goal saved'
	};
	const retention: Policy = {
		key: 'archiveRetentionMonths',
		id: 'archive-retention',
		label: 'Archive retention',
		description: 'How long archived people wait in Archives before they are deleted for good.',
		name: 'archive retention',
		unit: 'months',
		width: 'w-32',
		range: ARCHIVE_RETENTION_CONSTRAINT,
		draft: new DraftField.FieldDraft(() => policies.archiveRetentionMonths),
		was: (saved) => `${saved}`,
		hint: `Enter ${ARCHIVE_RETENTION_CONSTRAINT.min} to ${ARCHIVE_RETENTION_CONSTRAINT.max} months.`,
		invalid: `Archive retention must be a whole number of months from ${ARCHIVE_RETENTION_CONSTRAINT.min} to ${ARCHIVE_RETENTION_CONSTRAINT.max}.`,
		saved: 'Retention policy saved'
	};

	function save(policy: Policy) {
		return async (value: number | null) => {
			if (!isWhole(value, policy.range)) throw new Error(policy.invalid);
			await saveOrganizationSettings(orgUrlSegment, { [policy.key]: value });
			if (active) toastStore.success(policy.saved);
		};
	}

	const lossesOn = $derived(policies.lossCandidates !== null);
	const trainingOn = $derived(policies.groupReadiness !== null);
	const ranges = `Ranges · window ${LOSS_WARNING_CONSTRAINT.min}–${LOSS_WARNING_CONSTRAINT.max} days · goal ${TRAINING_READINESS_GOAL_CONSTRAINT.min}–${TRAINING_READINESS_GOAL_CONSTRAINT.max}% · retention ${ARCHIVE_RETENTION_CONSTRAINT.min}–${ARCHIVE_RETENTION_CONSTRAINT.max} months`;
</script>

{#snippet policyRow(policy: Policy, muted: boolean, sentence: Snippet<[number]>)}
	{@const draft = policy.draft}
	<PageShell.FactRow
		variant="display"
		label={policy.label}
		labelFor={policy.id}
		description={policy.description}
		{muted}
	>
		{#snippet control()}
			<DraftField.Status {draft} was={policy.was(draft.saved)} />
		{/snippet}
		{#snippet details()}
			<DraftField.Root
				{draft}
				id={policy.id}
				name={policy.name}
				was={policy.was(draft.saved)}
				save={save(policy)}
				inlineStatus={false}
			>
				{#snippet field(aria)}
					<InputGroup.Root class="{policy.width} bg-background">
						<InputGroup.Input
							id={policy.id}
							type="number"
							inputmode="numeric"
							min={policy.range.min}
							max={policy.range.max}
							step="1"
							class="font-mono"
							bind:value={() => draft.value, (value) => (draft.value = value)}
							{...aria}
						/>
						<InputGroup.Addon align="inline-end" variant="muted">
							<InputGroup.Text class="font-mono">{policy.unit}</InputGroup.Text>
						</InputGroup.Addon>
					</InputGroup.Root>
				{/snippet}
				{#if isWhole(draft.value, policy.range)}
					{@render sentence(draft.value)}
				{:else}
					{policy.hint}
				{/if}
			</DraftField.Root>
		{/snippet}
	</PageShell.FactRow>
{/snippet}

{#snippet lossSentence(days: number)}
	{#if lossCandidates.current.state === 'absent'}
		{FEATURE_SWITCHES.lossesAndAwards.label} is off for {unitName}, so no one is flagged. The window applies again when
		it's back on.
	{:else if lossCandidates.current.state === 'ready'}
		{lossWindowSentence(lossCandidates.current.value, days, lossWindow.draft.saved ?? days, policies.today)}
	{:else if lossCandidates.current.state === 'failed'}
		Loss dates couldn't load.
	{:else}
		At {days} days,
		{@render pendingTail('w-44', 'Loading the people flagged')}
	{/if}
{/snippet}

{#snippet readinessSentence(goal: number)}
	{#if groupReadiness.current.state === 'absent'}
		{FEATURE_SWITCHES.training.label} is off for {unitName}, so no group is graded against the goal. It applies again
		when Training is back on.
	{:else}
		Groups under {goal}% current show amber.
		{#if groupReadiness.current.state === 'ready'}
			{groupsUnderGoalSentence(groupReadiness.current.value, goal)}
		{:else if groupReadiness.current.state === 'failed'}
			Group readiness couldn't load.
		{:else}
			{@render pendingTail('w-80', 'Loading group readiness')}
		{/if}
	{/if}
{/snippet}

<!-- Sized to the typical streamed text, so it wraps where that text does and the row below stays put. -->
{#snippet pendingTail(width: string, label: string)}
	<Skeleton class="inline-block h-3.5 max-w-full {width} bg-foreground/10 align-middle" aria-hidden="true" />
	<span class="sr-only">{label}</span>
{/snippet}

{#snippet retentionSentenceFor(months: number)}
	{retentionSentence(policies.oldestArchivedAt, months, now)}
{/snippet}

<!-- One block, so the settings body's gap does not separate the ranges line from the last row. -->
<div>
	<PageShell.FactSection>
		{@render policyRow(lossWindow, !lossesOn, lossSentence)}
		{@render policyRow(readinessGoal, !trainingOn, readinessSentence)}
		{@render policyRow(retention, false, retentionSentenceFor)}
	</PageShell.FactSection>
	<p class="border-t border-border py-4 font-mono text-xs leading-5 text-muted-foreground">{ranges}</p>
</div>
