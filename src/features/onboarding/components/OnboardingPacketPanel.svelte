<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { STEP_TYPE_LABELS } from '../contexts/OnboardingPageContext.svelte';
	import type { OnboardingStepProgress, PersonnelOnboarding } from '../onboarding.types';
	import { clockLabel, isStepStalled, summarizePacket, type Today } from '../onboardingStatus';
	import { formatDisplayDate } from '$lib/utils/dates';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import X from '@lucide/svelte/icons/x';
	import OnboardingStageControls from './OnboardingStageControls.svelte';
	import { NoteDraft } from './noteDraft.svelte';
	import OnboardingStepNotes from './OnboardingStepNotes.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		onboarding: PersonnelOnboarding;
		today: Today;
		/** Renders the Soldier's name as the panel's accessible title. */
		heading: Snippet<[string]>;
		onClose?: () => void;
	}

	let { ctx, onboarding, today, heading, onClose }: Props = $props();

	const summary = $derived(summarizePacket(onboarding, today));
	const canManage = $derived(ctx.canManageOnboarding(onboarding) && onboarding.status === 'in_progress');
	const canConfigure = $derived(ctx.canConfigureOnboarding(onboarding));
	const person = $derived(ctx.getPerson(onboarding.personnelId));
	const profileUrl = $derived(ctx.profileUrl(onboarding.personnelId));
	const resyncError = $derived(ctx.getResyncError(onboarding.id));

	const activeSteps = $derived(onboarding.steps.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder));
	const openSteps = $derived.by(() => {
		const open = activeSteps.filter((s) => !s.completed);
		const focus = summary.focus;
		return focus ? [focus, ...open.filter((s) => s.id !== focus.id)] : open;
	});
	const doneSteps = $derived(activeSteps.filter((s) => s.completed));
	const removableSteps = $derived(onboarding.steps.filter((s) => !s.active && !s.completed));
	const subtitle = $derived(
		[
			ctx.getPersonGroupName(onboarding.personnelId),
			person?.mos || null,
			summary.clock.kind === 'day'
				? `started ${formatDisplayDate(onboarding.startedAt)}, day ${summary.clock.day}`
				: `${clockLabel(summary.clock)} (${formatDisplayDate(onboarding.startedAt)})`
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** Undefined shows the focus step as the open card. Ignored once that step is no longer open. */
	let openCardId = $state<string | undefined>(undefined);
	let doneExpandedId = $state<string | null>(null);
	let doneOpen = $state(false);
	const noteDraft = new NoteDraft();

	const cardId = $derived(
		openCardId && openSteps.some((step) => step.id === openCardId) ? openCardId : (summary.focus?.id ?? null)
	);

	function stageLine(step: OnboardingStepProgress) {
		const stages = step.stages ?? [];
		if (step.currentStage === null) return `Not started · ${stages.length} stages`;
		return `${step.currentStage} · stage ${stages.indexOf(step.currentStage) + 1} of ${stages.length}`;
	}
</script>

{#snippet typeLabel(step: OnboardingStepProgress)}
	<span class="shrink-0 font-mono text-xs uppercase text-muted-foreground">{STEP_TYPE_LABELS[step.stepType]}</span>
{/snippet}

{#snippet openMarker(step: OnboardingStepProgress)}
	{#if step.stepType === 'checkbox' && canManage}
		<Checkbox
			checked={false}
			aria-label={`Mark ${step.stepName} complete`}
			onCheckedChange={() => ctx.handleToggleCheckbox(step)}
		/>
	{:else}
		<span aria-hidden="true" class="size-4 shrink-0 rounded-full border border-dashed border-muted-foreground"></span>
	{/if}
{/snippet}

{#snippet trainingLink()}
	{#if ctx.canOpenTraining}
		<Button href={ctx.trainingPageUrl} variant="link" size="none" class="h-auto justify-start p-0 text-sm">
			Record training
		</Button>
	{/if}
{/snippet}

{#snippet stepCard(step: OnboardingStepProgress)}
	<div
		class={[
			'grid gap-3 rounded-lg border p-3',
			isStepStalled(step, today) ? 'border-warning bg-warning-muted' : 'border-border bg-card-alt'
		]}
	>
		<div class="flex items-start gap-2">
			{#if step.stepType === 'checkbox'}{@render openMarker(step)}{/if}
			<h4 class="min-w-0 flex-1 font-semibold wrap-anywhere">{step.stepName}</h4>
			{@render typeLabel(step)}
		</div>
		{#if step.stepType === 'paperwork'}
			<OnboardingStageControls {step} {today} {canManage} onSelect={(stage) => ctx.handleStageClick(step, stage)} />
		{:else if step.stepType === 'training'}
			<div class="grid gap-1">
				<p class="text-sm text-muted-foreground">Waiting on training record</p>
				{@render trainingLink()}
			</div>
		{/if}
		<OnboardingStepNotes {ctx} {step} {canManage} draft={noteDraft} />
	</div>
{/snippet}

{#snippet stepRow(step: OnboardingStepProgress)}
	<div class="flex items-start gap-2 border-b border-border py-3 last:border-b-0">
		{@render openMarker(step)}
		<div class="grid min-w-0 flex-1 gap-0.5">
			<Button
				variant="ghost"
				size="none"
				class="min-w-0 justify-start p-0 text-left text-sm whitespace-normal wrap-anywhere"
				aria-expanded={false}
				onclick={() => (openCardId = step.id)}
			>
				{step.stepName}
			</Button>
			{#if step.stepType === 'paperwork'}
				<span class="text-xs wrap-anywhere text-muted-foreground">{stageLine(step)}</span>
			{:else if step.stepType === 'training'}
				{@render trainingLink()}
			{/if}
		</div>
		{@render typeLabel(step)}
	</div>
{/snippet}

<section class="flex h-full min-h-0 flex-col" aria-label="Onboarding packet">
	<div class="grid gap-3 border-b border-border p-4">
		<div class="flex items-start gap-2">
			<div class="grid min-w-0 flex-1 gap-1">
				<p class="font-mono text-xs uppercase tracking-wider wrap-anywhere text-muted-foreground">
					Packet · {ctx.getTemplateName(onboarding.templateId)}
				</p>
				{@render heading(ctx.getPersonName(onboarding.personnelId))}
				<p class="text-sm wrap-anywhere text-muted-foreground">{subtitle}</p>
			</div>
			{#if onClose}
				<Button variant="ghost" size="icon-sm" aria-label="Close packet" onclick={onClose}><X /></Button>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<div class="flex gap-1" role="img" aria-label={`${summary.done} of ${summary.total} steps done`}>
				{#each activeSteps as step (step.id)}
					<span
						class={[
							'h-1 flex-1 rounded-full',
							step.completed ? 'bg-foreground' : isStepStalled(step, today) ? 'bg-warning' : 'bg-muted'
						]}
					></span>
				{/each}
			</div>
			<div class="flex justify-between font-mono text-xs">
				<span>{summary.done} of {summary.total} done</span>
				{#if summary.stalledCount > 0}
					<span class="text-warning-foreground">{summary.stalledCount} stalled</span>
				{/if}
			</div>
		</div>
	</div>

	<div class="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-4">
		{#if resyncError}
			<Alert.Root variant="destructive">
				<CircleAlert />
				<Alert.Title>Sync Problem</Alert.Title>
				<Alert.Description>{resyncError}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if openSteps.length > 0}
			<div class="grid gap-2">
				<h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Open · {openSteps.length}</h3>
				<div class="grid">
					{#each openSteps as step (step.id)}
						{#if step.id === cardId}
							<div class="pb-2">{@render stepCard(step)}</div>
						{:else}
							{@render stepRow(step)}
						{/if}
					{/each}
				</div>
			</div>
		{/if}

		{#if doneSteps.length > 0}
			<Collapsible.Root bind:open={doneOpen}>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="none"
							class="w-full items-start justify-start gap-2 py-1 text-left"
						>
							<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1 text-sm whitespace-normal wrap-anywhere text-muted-foreground">
								{doneSteps.length} done · {doneSteps.map((s) => s.stepName).join(', ')}
							</span>
							<ChevronDown
								class={['mt-0.5 size-4 shrink-0 transition-transform', !doneOpen && '-rotate-90']}
								aria-hidden="true"
							/>
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content class="grid pt-1">
					{#each doneSteps as step (step.id)}
						<div class="grid gap-2 border-b border-border py-2 last:border-b-0">
							<div class="flex items-start gap-2">
								{#if step.stepType === 'checkbox' && canManage}
									<Checkbox
										checked={true}
										class="mt-0.5"
										aria-label={`Mark ${step.stepName} incomplete`}
										onCheckedChange={() => ctx.handleToggleCheckbox(step)}
									/>
								{:else}
									<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />
								{/if}
								{#if step.stepType === 'paperwork'}
									<Button
										variant="ghost"
										size="none"
										class="min-w-0 flex-1 justify-start p-0 text-left text-sm whitespace-normal wrap-anywhere text-muted-foreground"
										aria-expanded={doneExpandedId === step.id}
										onclick={() => (doneExpandedId = doneExpandedId === step.id ? null : step.id)}
									>
										{step.stepName}
									</Button>
								{:else}
									<span class="min-w-0 flex-1 text-sm wrap-anywhere text-muted-foreground">{step.stepName}</span>
								{/if}
								{@render typeLabel(step)}
							</div>
							{#if step.stepType === 'paperwork' && doneExpandedId === step.id}
								<OnboardingStageControls
									{step}
									{today}
									{canManage}
									onSelect={(stage) => ctx.handleStageClick(step, stage)}
								/>
							{/if}
						</div>
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>

	{#if canManage || profileUrl}
		<div class="flex items-center gap-2 border-t border-border p-4">
			{#if canManage}
				<Button size="sm" onclick={() => ctx.promptCompleteOnboarding(onboarding.id)}>
					{openSteps.length > 0 ? `Close out · ${openSteps.length} open` : 'Close out'}
				</Button>
			{/if}
			<span class="flex-1"></span>
			{#if profileUrl}
				<Button size="sm" variant="outline" href={profileUrl}>Open profile</Button>
			{/if}
			{#if canManage}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} size="icon-sm" variant="outline" aria-label="More packet actions">
								<Ellipsis />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						{#if canConfigure}
							<DropdownMenu.Item
								disabled={ctx.isResyncing(onboarding.id)}
								onSelect={() => ctx.handleResync(onboarding.id)}
							>
								Re-sync with template
							</DropdownMenu.Item>
							{#if onboarding.templateId === null}
								<DropdownMenu.Item onSelect={() => ctx.openAssignTemplate(onboarding.id)}
									>Assign template</DropdownMenu.Item
								>
							{:else}
								<DropdownMenu.Item onSelect={() => ctx.openSwitchTemplate(onboarding.id)}
									>Switch template</DropdownMenu.Item
								>
							{/if}
						{/if}
						{#each removableSteps as step (step.id)}
							<DropdownMenu.Item
								disabled={ctx.removingDeprecatedStepId === step.id}
								onSelect={() => ctx.handleRemoveDeprecatedStep(step.id)}
							>
								Remove {step.stepName}
							</DropdownMenu.Item>
						{/each}
						{#if canConfigure || removableSteps.length > 0}
							<DropdownMenu.Separator />
						{/if}
						<DropdownMenu.Item variant="destructive" onSelect={() => (ctx.cancellingId = onboarding.id)}>
							Cancel onboarding
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	{/if}
</section>
