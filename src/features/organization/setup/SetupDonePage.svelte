<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';
	import type { SetupFact, SetupFactKey, SetupFacts, SetupStepKey } from './registry';
	import SetupFooterBar from './SetupFooterBar.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	let { orgName }: { orgName: string } = $props();

	const flow = getSetupFlow();
	const model = $derived(flow.model);
	const facts = $derived(flow.facts);

	function counted(fact: SetupFact<number>, one: string, many = `${one}s`) {
		if (fact.status === 'error') return 'Count could not be loaded';
		return `${fact.value} ${fact.value === 1 ? one : many}`;
	}

	const ON_LINES: Partial<Record<SetupStepKey, (facts: SetupFacts) => string>> = {
		training: (f) => counted(f.trainingTypes, 'training type'),
		criticalTasks: (f) => counted(f.criticalTasks, 'task list'),
		evaluations: (f) => counted(f.evaluations, 'rating scheme entry', 'rating scheme entries'),
		onboarding: (f) => counted(f.onboardingTemplates, 'template'),
		lossesAndAwards: (f) =>
			f.lossWarningWindowDays.status === 'ready'
				? `${f.lossWarningWindowDays.value}-day warning window`
				: 'Warning window could not be loaded',
		eventsAndTaskings: (f) => `${counted(f.events, 'event')} · ${counted(f.taskings, 'tasking')}`
	};

	const COUNTS: { source: SetupFactKey; label: string }[] = [
		{ source: 'groups', label: 'Groups' },
		{ source: 'activeRanks', label: 'Ranks' },
		{ source: 'activePeople', label: 'People' },
		{ source: 'statusTypes', label: 'Statuses' },
		{ source: 'pendingInvitations', label: 'Invites pending' }
	];

	const columns = $derived(
		model && facts
			? [
					{
						label: 'On',
						swatch: 'bg-success',
						steps: model.on.map((step) => ({ ...step, line: ON_LINES[step.key]?.(facts) ?? 'On' }))
					},
					{
						label: 'Later',
						swatch: 'bg-accent',
						steps: model.later.map((step) => ({
							...step,
							line: "Stays on. Set it up from Unit settings when you're ready."
						}))
					},
					{
						label: 'Off',
						swatch: 'bg-muted-foreground/45',
						steps: model.off.map((step) => ({
							...step,
							line: 'Hidden for everyone. Turn it back on in Unit settings › Features.'
						}))
					}
				]
			: null
	);
	const allReviewed = $derived(model !== null && model.unanswered.length === 0);
	const open = $derived(model?.unanswered.length ?? 0);
</script>

<div class="flex max-w-190 flex-col gap-3">
	{#if model}
		<p
			class={cn(
				'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase',
				allReviewed ? 'text-success-foreground' : 'text-muted-foreground'
			)}
		>
			{model.reviewed} of {model.total} reviewed
		</p>
		<h1 class="font-heading text-5xl leading-12 font-extrabold uppercase lg:text-[64px] lg:leading-[60px]">
			{allReviewed ? `${orgName} is ready` : `${open} ${open === 1 ? 'step' : 'steps'} still open`}
		</h1>
	{:else}
		<Skeleton class="h-3.5 w-36" aria-hidden="true" />
		<Skeleton class="h-12 w-2/3 lg:h-[60px]" aria-hidden="true" />
		<p class="sr-only">Loading the summary</p>
	{/if}
	<p class="text-[17px] leading-[26px]">
		{#if model && !allReviewed}
			Open steps keep their place. Finish now and come back from Unit settings any time.
		{:else}
			Here's what you set up. All of it can be changed in Unit settings, and setup stays there if you want to walk
			through it again.
		{/if}
	</p>
	{#if model && !allReviewed}
		<p class="text-sm leading-5 text-muted-foreground">
			Still open:
			{#each model.unanswered as step, index (step.key)}
				<a href={resolve(flow.href(step.slug) as '/')} class="text-foreground underline">{step.title}</a>{index <
				model.unanswered.length - 1
					? ', '
					: '.'}
			{/each}
		</p>
	{/if}
</div>

<dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
	{#each COUNTS as { source, label } (source)}
		{@const fact = facts?.[source]}
		<div class="flex flex-col gap-0.5 border-t border-border pt-3">
			<dt
				class="order-2 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				{label}
			</dt>
			<dd class="order-1 font-heading text-[40px] leading-10 font-extrabold">
				{#if !fact}
					<Skeleton class="my-1 h-8 w-12" aria-hidden="true" />
					<span class="sr-only">Loading</span>
				{:else if fact.status === 'error'}
					<span aria-hidden="true">–</span>
					<span class="sr-only">could not be loaded</span>
				{:else}
					{fact.value}
				{/if}
			</dd>
		</div>
	{/each}
</dl>

<div class="grid items-start gap-8 md:grid-cols-3">
	{#each columns ?? [{ label: 'On' }, { label: 'Later' }, { label: 'Off' }] as column (column.label)}
		<section class="flex flex-col" aria-labelledby="setup-done-{column.label}">
			<h2 class="flex items-center gap-2 border-b-2 border-foreground pb-2">
				<span
					class={cn('size-2 shrink-0 rounded-sm', 'swatch' in column ? column.swatch : 'bg-muted')}
					aria-hidden="true"
				></span>
				<span
					id="setup-done-{column.label}"
					class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase"
				>
					{column.label}
				</span>
			</h2>
			{#if 'steps' in column}
				{#each column.steps as step (step.key)}
					<div class="flex flex-col gap-0.5 border-b border-border py-2.5">
						<p class="text-[15px] leading-5 font-semibold">{step.title}</p>
						<p class="text-[13px] leading-[18px] text-muted-foreground">{step.line}</p>
					</div>
				{:else}
					<p class="border-b border-border py-2.5 text-[13px] leading-[18px] text-muted-foreground">None</p>
				{/each}
			{:else}
				<div class="flex flex-col gap-1.5 border-b border-border py-2.5" aria-hidden="true">
					<Skeleton class="h-4 w-28" />
					<Skeleton class="h-3.5 w-40" />
				</div>
			{/if}
		</section>
	{/each}
</div>

<SetupFooterBar error={flow.error}>
	<p
		class="min-w-0 flex-1 text-right font-mono text-[11px] leading-[14px] tracking-[0.04em] text-muted-foreground max-sm:text-left"
	>
		Setup stays in Unit settings
	</p>
	<Button
		size="lg"
		aria-busy={flow.pending || undefined}
		aria-disabled={flow.pending ? 'true' : undefined}
		onclick={() => flow.finish()}
	>
		Finish
		{#if flow.pending}
			<Spinner data-icon="inline-end" aria-label="Saving" />
		{:else}
			<ChevronRight data-icon="inline-end" aria-hidden="true" />
		{/if}
	</Button>
</SetupFooterBar>
